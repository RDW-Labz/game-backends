# Model-Predictive-Control

- **Category:** netcode — This project is to use Model Predictive Control (MPC) to drive a car in a game simulator. The server provides reference waypoints (yellow line in the demo video
- **Language:** c++
- **Licence:** `MIT` (clean)
- **Delivery:** vendored
- **Upstream:** https://github.com/JunshengFu/Model-Predictive-Control @ `d4c79c5829b5`
- **Discovered via:** github-search:websocket game server stars:>40
- **Code:** `src/`

JunshengFu/Model-Predictive-Control — This project is to use Model Predictive Control (MPC) to drive a car in a game simulator. The server provides reference waypoints (yellow line in the demo video) via websocket, and we use MPC to compute steering and throttle commands to drive the car. The solution must be robust to 100ms latency, since it might encounter in real-world application.

**Why it qualifies:** Discovered by the 15-minute library tick; passed the category and licence gate.
