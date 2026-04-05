"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectButtonWrapper() {
  return (
    <ConnectButton
      showBalance={false}
      accountStatus="avatar"
      chainStatus="icon"
    />
  );
}
