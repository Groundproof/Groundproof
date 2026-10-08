# GroundProof V0.4 isolated preview

V0.3 currently simulates Count (18 Rohre), stores its result in localStorage, and discards the original image. This violates the continuous evidence-ledger requirement. The V0.4 stream must append a Count capture through the existing appendCapture API, then use the confirmed Count, Build and Yield quantities from the same verified ledger. Do not publish a finished claim until browser and mobile QA pass.
