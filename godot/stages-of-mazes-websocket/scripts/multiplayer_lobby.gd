extends Control

const DEFAULT_CLOUD_IP := "134.209.170.50"
const DEFAULT_PORT := 7777
const DEFAULT_WEB_SOCKET_URL := "wss://facelessanimalstudios.com/stages-ws"

func _server_target() -> String:
	return DEFAULT_WEB_SOCKET_URL if OS.has_feature("web") else DEFAULT_CLOUD_IP

func connect_to_default_server() -> void:
	LobbyServer.join_lobby(_server_target(), DEFAULT_PORT)
