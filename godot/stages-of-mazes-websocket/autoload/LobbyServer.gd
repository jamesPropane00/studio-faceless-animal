extends Node

const DEFAULT_PORT := 7777

func join_lobby(address: String, port: int = DEFAULT_PORT) -> void:
	if OS.has_feature("web"):
		var url := address.strip_edges()
		if not url.begins_with("ws://") and not url.begins_with("wss://"):
			url = "wss://" + url
		var peer := WebSocketMultiplayerPeer.new()
		var err := peer.create_client(url)
		if err != OK:
			push_error("WebSocket connect failed: %s" % err)
			return
		multiplayer.multiplayer_peer = peer
		return

	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		push_error("ENet connect failed: %s" % err)
		return
	multiplayer.multiplayer_peer = peer
