# Stages of Mazes — WebSocket web build

This folder is the isolated web-only multiplayer lane. The original Godot project remains untouched.

- Godot 4.6
- GL Compatibility renderer
- Browser transport: WebSocketMultiplayerPeer
- Production endpoint: `wss://facelessanimalstudios.com/stages-ws`
- Native/server endpoint remains the existing server on port 7777

## Movement / RPC fixes

- remote players no longer call `move_and_slide()` after interpolating replicated position
- movement state uses `unreliable_ordered`
- state send rate is 20 Hz
- large corrections snap instead of dragging across the map
- only the owning multiplayer authority can send movement state
- server-side `call_local` RPC sender id 0 is accepted where appropriate
