// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Checkout, IUSDT} from "../src/Checkout.sol";

interface ITetherV2 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// Runs against a fork of Whitechain Sepolia and the real prize-page USDT.
/// `forge test --match-contract CheckoutFork --fork-url whitechain`
/// Skips itself when not forked.
contract CheckoutForkTest is Test {
    address constant USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    Checkout checkout;
    uint256 payerKey = 0xA11CE;
    uint256 merchantKey = 0xB0B;
    address payer;
    address merchant;

    function setUp() public {
        if (block.chainid != 1874) return;
        checkout = new Checkout(IUSDT(USDT));
        payer = vm.addr(payerKey);
        merchant = vm.addr(merchantKey);
        deal(USDT, payer, 10_000_000);
    }

    /// The token has no version(), so the domain is recovered from DOMAIN_SEPARATOR.
    /// This is the domain the pay app and the x402 client sign with.
    function test_domainMatchesToken() public view {
        if (block.chainid != 1874) return;
        bytes32 ours = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                uint256(1874),
                USDT
            )
        );
        assertEq(ours, ITetherV2(USDT).DOMAIN_SEPARATOR());
    }

    function _sign(uint256 key, uint256 value, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_TYPEHASH, vm.addr(key), address(checkout), value, 0, block.timestamp + 300, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ITetherV2(USDT).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_payAndRefundOnRealToken() public {
        if (block.chainid != 1874) return;
        bytes32 orderId = keccak256("ord_fork");
        uint128 price = 5_000_000;

        checkout.pay(
            orderId, merchant, payer, price, 0, block.timestamp + 300, _sign(payerKey, price, checkout.payNonce(orderId, merchant))
        );
        assertEq(ITetherV2(USDT).balanceOf(merchant), price);

        checkout.refund(
            orderId, 2_000_000, 0, block.timestamp + 300, _sign(merchantKey, 2_000_000, checkout.refundNonce(orderId, 0))
        );
        assertEq(ITetherV2(USDT).balanceOf(payer), 7_000_000);
        assertEq(ITetherV2(USDT).balanceOf(merchant), 3_000_000);
    }
}
