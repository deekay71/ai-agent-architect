# Local verification before native dispatch

Both the working repository and a fresh source copy passed **570/570 tests, zero failures or skips**. The full synthetic acceptance test completed 300 trials / 540 candidate-summary calls and 50 mock judgment batches after six mock calibration batches; it produced quality-pass diagnostics but correctly refused native acceptance authority. The explicit test-only Memory issuer seam passed its promotion/revocation chain and five negative traces.

The final clean run is `clean-acceptance-20260928T095421Z`: 170 copied source/test/fixture/script/config files remained unchanged, frozen dependency install passed, and 119 compiled JavaScript files were recorded. See its JSON summary and source/build manifests for hashes.

Two failed development runs are preserved. The first found a production verification bug: a parsed resource projection was compared to full raw resources. Comparing full raw arrays on both sides preserves all fields and fixes false drift; Astra independently reviewed that change. The second exposed oversized Full packets in the synthetic test because unrelated test cases shared one task scope. Giving each synthetic case its own task class fixed the fixture. Real allowances, private holdout, calibration labels and acceptance thresholds were not changed.

No native benchmark calls were made during these tests. Preserved synthetic fixture directories are local debugging artifacts only, never native model evidence.
