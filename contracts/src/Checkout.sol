// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// The EIP-3009 and ERC-20 calls Checkout needs from the USDT.
interface IUSDT {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;

    function transfer(address to, uint256 value) external returns (bool);
}

/// @title Checkout
/// @notice On-chain receipts and capped refunds for Till orders.
/// The customer signs a USDT ReceiveWithAuthorization to this contract, with a nonce
/// bound to the order. Anyone can submit it (our relayer pays the gas). The contract
/// pulls the USDT, forwards it to the merchant and records the order. A refund works
/// the same way in reverse, signed by the merchant, and can never exceed what was paid.
/// The contract holds no funds between calls and has no owner.
contract Checkout {
    struct Order {
        address payer;
        address merchant;
        uint128 amount;
        uint128 refunded;
    }

    IUSDT public immutable usdt;
    mapping(bytes32 => Order) public orders;

    event Paid(bytes32 indexed orderId, address indexed merchant, address indexed payer, uint256 amount);
    event Refunded(bytes32 indexed orderId, address indexed payer, uint256 amount, uint256 totalRefunded);

    error AlreadyPaid();
    error NotPaid();
    error ZeroAmount();
    error RefundTooLarge();
    error TransferFailed();

    constructor(IUSDT _usdt) {
        usdt = _usdt;
    }

    /// The nonce the customer signs for an order. A signature for one order or merchant
    /// can't be used for another.
    function payNonce(bytes32 orderId, address merchant) public pure returns (bytes32) {
        return keccak256(abi.encode(orderId, merchant));
    }

    /// The nonce the merchant signs for the next refund step of an order.
    function refundNonce(bytes32 orderId, uint256 refundedBefore) public pure returns (bytes32) {
        return keccak256(abi.encode(orderId, "refund", refundedBefore));
    }

    function pay(
        bytes32 orderId,
        address merchant,
        address payer,
        uint128 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata signature
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (orders[orderId].amount != 0) revert AlreadyPaid();

        orders[orderId] = Order({payer: payer, merchant: merchant, amount: amount, refunded: 0});

        usdt.receiveWithAuthorization(
            payer, address(this), amount, validAfter, validBefore, payNonce(orderId, merchant), signature
        );
        _send(merchant, amount);

        emit Paid(orderId, merchant, payer, amount);
    }

    function refund(
        bytes32 orderId,
        uint128 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata signature
    ) external {
        Order storage order = orders[orderId];
        if (order.amount == 0) revert NotPaid();
        if (amount == 0) revert ZeroAmount();
        uint128 refundedBefore = order.refunded;
        if (uint256(refundedBefore) + amount > order.amount) revert RefundTooLarge();

        order.refunded = refundedBefore + amount;

        usdt.receiveWithAuthorization(
            order.merchant,
            address(this),
            amount,
            validAfter,
            validBefore,
            refundNonce(orderId, refundedBefore),
            signature
        );
        _send(order.payer, amount);

        emit Refunded(orderId, order.payer, amount, order.refunded);
    }

    /// USDT-style tokens may return nothing from transfer, so accept empty return data.
    function _send(address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(usdt).call(abi.encodeCall(IUSDT.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
