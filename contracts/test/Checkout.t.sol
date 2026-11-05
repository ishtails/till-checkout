// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Checkout, IUSDT} from "../src/Checkout.sol";
import {MockUSDT} from "./MockUSDT.sol";

contract CheckoutTest is Test {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    MockUSDT usdt;
    Checkout checkout;

    uint256 payerKey = 0xA11CE;
    uint256 merchantKey = 0xB0B;
    uint256 strangerKey = 0xBAD;
    address payer;
    address merchant;
    address stranger;

    bytes32 orderId = keccak256("ord_1");
    uint128 constant PRICE = 5_000_000; // $5.00

    function setUp() public {
        vm.warp(1_800_000_000);
        usdt = new MockUSDT();
        checkout = new Checkout(IUSDT(address(usdt)));
        payer = vm.addr(payerKey);
        merchant = vm.addr(merchantKey);
        stranger = vm.addr(strangerKey);
        usdt.mint(payer, 25_000_000);
    }

    function _sign(uint256 key, uint256 value, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, vm.addr(key), address(checkout), value, 0, block.timestamp + 300, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _pay() internal {
        bytes memory sig = _sign(payerKey, PRICE, checkout.payNonce(orderId, merchant));
        checkout.pay(orderId, merchant, payer, PRICE, 0, block.timestamp + 300, sig);
    }

    function _refund(uint128 amount, uint256 key) internal {
        (,,, uint128 refunded) = checkout.orders(orderId);
        bytes memory sig = _sign(key, amount, checkout.refundNonce(orderId, refunded));
        checkout.refund(orderId, amount, 0, block.timestamp + 300, sig);
    }

    function test_pay_movesUsdtToMerchantAndRecordsOrder() public {
        vm.expectEmit(address(checkout));
        emit Checkout.Paid(orderId, merchant, payer, PRICE);
        vm.prank(stranger); // anyone can submit; the signature carries the authority
        _pay();

        assertEq(usdt.balanceOf(merchant), PRICE);
        assertEq(usdt.balanceOf(payer), 20_000_000);
        assertEq(usdt.balanceOf(address(checkout)), 0);
        (address p, address m, uint128 amount, uint128 refunded) = checkout.orders(orderId);
        assertEq(p, payer);
        assertEq(m, merchant);
        assertEq(amount, PRICE);
        assertEq(refunded, 0);
    }

    function test_pay_twiceReverts() public {
        _pay();
        bytes memory sig = _sign(payerKey, PRICE, checkout.payNonce(orderId, merchant));
        vm.expectRevert(Checkout.AlreadyPaid.selector);
        checkout.pay(orderId, merchant, payer, PRICE, 0, block.timestamp + 300, sig);
    }

    function test_pay_toDifferentMerchantReverts() public {
        // The customer signed for `merchant`; redirecting the order to a stranger changes the nonce.
        bytes memory sig = _sign(payerKey, PRICE, checkout.payNonce(orderId, merchant));
        vm.expectRevert("TetherToken: invalid signature");
        checkout.pay(orderId, stranger, payer, PRICE, 0, block.timestamp + 300, sig);
    }

    function test_pay_differentAmountReverts() public {
        bytes memory sig = _sign(payerKey, PRICE, checkout.payNonce(orderId, merchant));
        vm.expectRevert("TetherToken: invalid signature");
        checkout.pay(orderId, merchant, payer, PRICE * 10, 0, block.timestamp + 300, sig);
    }

    function test_pay_expiredReverts() public {
        bytes memory sig = _sign(payerKey, PRICE, checkout.payNonce(orderId, merchant));
        uint256 validBefore = block.timestamp + 300;
        vm.warp(validBefore);
        vm.expectRevert("TetherToken: auth expired");
        checkout.pay(orderId, merchant, payer, PRICE, 0, validBefore, sig);
    }

    function test_refund_full() public {
        _pay();
        vm.expectEmit(address(checkout));
        emit Checkout.Refunded(orderId, payer, PRICE, PRICE);
        _refund(PRICE, merchantKey);

        assertEq(usdt.balanceOf(payer), 25_000_000);
        assertEq(usdt.balanceOf(merchant), 0);
        (,,, uint128 refunded) = checkout.orders(orderId);
        assertEq(refunded, PRICE);
    }

    function test_refund_partialsSumToFull() public {
        _pay();
        _refund(2_000_000, merchantKey);
        _refund(3_000_000, merchantKey);
        assertEq(usdt.balanceOf(payer), 25_000_000);
        (,,, uint128 refunded) = checkout.orders(orderId);
        assertEq(refunded, PRICE);
    }

    function test_refund_aboveCapReverts() public {
        _pay();
        _refund(4_000_000, merchantKey);
        bytes memory sig = _sign(merchantKey, 2_000_000, checkout.refundNonce(orderId, 4_000_000));
        vm.expectRevert(Checkout.RefundTooLarge.selector);
        checkout.refund(orderId, 2_000_000, 0, block.timestamp + 300, sig);
    }

    function test_refund_signedBySomeoneElseReverts() public {
        _pay();
        usdt.mint(stranger, PRICE);
        bytes memory sig = _sign(strangerKey, PRICE, checkout.refundNonce(orderId, 0));
        vm.expectRevert("TetherToken: invalid signature");
        checkout.refund(orderId, PRICE, 0, block.timestamp + 300, sig);
    }

    function test_refund_signatureCantBeReplayed() public {
        _pay();
        bytes memory sig = _sign(merchantKey, 1_000_000, checkout.refundNonce(orderId, 0));
        checkout.refund(orderId, 1_000_000, 0, block.timestamp + 300, sig);
        // The refunded total moved on, so the same signature now has the wrong nonce.
        vm.expectRevert("TetherToken: invalid signature");
        checkout.refund(orderId, 1_000_000, 0, block.timestamp + 300, sig);
    }

    function test_refund_unpaidOrderReverts() public {
        bytes memory sig = _sign(merchantKey, PRICE, checkout.refundNonce(orderId, 0));
        vm.expectRevert(Checkout.NotPaid.selector);
        checkout.refund(orderId, PRICE, 0, block.timestamp + 300, sig);
    }
}
