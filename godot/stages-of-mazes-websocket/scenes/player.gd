extends CharacterBody2D
class_name Player

@export var speed := 200.0
@export var net_send_rate := 20.0
@export var net_snap_distance := 220.0
@export var net_interp_speed := 16.0
@export var net_extrapolation_ms := 120

var _net_send_t := 0.0
var _net_target_pos := Vector2.ZERO
var _net_target_vel := Vector2.ZERO
var _net_has_target := false
var _net_last_state_ms := 0

func _ready() -> void:
	_net_target_pos = global_position

func _physics_process(delta: float) -> void:
	if multiplayer.has_multiplayer_peer() and not is_multiplayer_authority():
		if _net_has_target:
			var age_ms := clampi(Time.get_ticks_msec() - _net_last_state_ms, 0, net_extrapolation_ms)
			var target := _net_target_pos + _net_target_vel * (float(age_ms) / 1000.0)
			if global_position.distance_to(target) >= net_snap_distance:
				global_position = target
			else:
				global_position = global_position.lerp(target, min(1.0, net_interp_speed * delta))
			velocity = _net_target_vel
		else:
			velocity = Vector2.ZERO
		return

	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = dir.normalized() * speed if dir.length() > 0.0 else Vector2.ZERO
	move_and_slide()
	_send_net_state(delta)

func _send_net_state(delta: float) -> void:
	if not multiplayer.has_multiplayer_peer() or not is_multiplayer_authority():
		return
	_net_send_t -= delta
	if _net_send_t > 0.0:
		return
	_net_send_t = 1.0 / max(1.0, net_send_rate)
	_rpc_owner_state_to_server.rpc_id(1, global_position, velocity)

@rpc("any_peer", "call_remote", "unreliable_ordered", 1)
func _rpc_owner_state_to_server(pos: Vector2, vel: Vector2) -> void:
	if not multiplayer.is_server():
		return
	var sender := multiplayer.get_remote_sender_id()
	if sender != get_multiplayer_authority():
		return
	global_position = pos
	velocity = vel
	_rpc_server_broadcast_state.rpc(name, pos, vel)

@rpc("any_peer", "call_local", "unreliable_ordered", 1)
func _rpc_server_broadcast_state(player_name: String, pos: Vector2, vel: Vector2) -> void:
	if multiplayer.has_multiplayer_peer():
		var sender := multiplayer.get_remote_sender_id()
		if sender != 1 and not (multiplayer.is_server() and sender == 0):
			return
	if str(name) != str(player_name):
		return
	if multiplayer.has_multiplayer_peer() and is_multiplayer_authority():
		return
	_net_target_pos = pos
	_net_target_vel = vel
	_net_last_state_ms = Time.get_ticks_msec()
	_net_has_target = true
