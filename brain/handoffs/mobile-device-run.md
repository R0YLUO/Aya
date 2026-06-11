---
title: Run the mobile app on a simulator/device
type: handoff
status: open
packages: [mobile]
tasks: [mobile-camera-capture, mobile-scan-flow, mobile-local-store, mobile-reader-view, mobile-error-states]
summary: All mobile work is verified via framework-free unit tests only; the RN app has never been launched, and camera capture needs a real device.
updated: 2026-06-11
---

# Run the mobile app on a simulator/device

## What's needed

A human-driven launch of `packages/mobile` on an iOS simulator / Android emulator,
and — for the camera flow specifically — a physical device (simulators have no real
camera). Requires local Xcode/Android tooling agents can't install or operate.

## Why

The mobile convention is framework-free, unit-tested core logic with thin RN screens
(see [@aya/mobile](../packages/mobile.md)): reducers, services, and the API client
are well tested, but the actual screens, navigation, AsyncStorage persistence across
a real app reload, and camera capture have never been exercised on a device. Full
scan-flow verification also depends on a deployed API
(see [AWS account](./aws-account.md)).

## Verify after

Walk PRD Story 1 on a device: open camera → capture → preview → retake/confirm.
Also walk PRD Story 2: render an `AnalyzedPage` in `ReaderView` and confirm phrases
are legibly sized, line breaks are preserved, the page scrolls smoothly, and only
pinyin-bearing phrases are tappable (the underline affordance shows).
Also confirm the scan-error UI: force each scan error code and verify
`ScanErrorScreen` shows the PRD copy inline (no crash) and the CTA routes
correctly — Retake returns to the camera; Retry re-runs upload+scan.
Until the API is deployed, confirm at least that the app boots and screens render.
Note observations here, then mark resolved (or file follow-up issues).
