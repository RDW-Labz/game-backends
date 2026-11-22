extends Node
## A scripted client for testing alone: launch an extra instance with --bot and
## it joins 127.0.0.1, readies up in the lobby, and walks in a slow circle
## through the same input path a human uses, so it exercises prediction and
## server validation too.

var elapsed: float = 0.0
var _last_ready_request: float = -10.0


func _process(delta: float) -> void:
	if not Net.has_session():
		return
	elapsed += delta
	_ready_up()
	if not is_instance_valid(SessionFlow.world):
		return
	var avatar: Node2D = SessionFlow.world.get_node_or_null("Players/%d" % Net.my_id())
	if avatar == null:
		return
	var direction: Vector2 = Vector2.from_angle(elapsed * 0.5)
	avatar.input.bot_driven = true
	avatar.input.bot_move = direction * 0.45
	avatar.input.bot_aim = direction.angle()


## Ask to be ready whenever the roster says we are not, at most once a second.
func _ready_up() -> void:
	if GameState.phase != GameState.Phase.LOBBY or not Net.peers.has(Net.my_id()):
		return
	if bool(Net.peers[Net.my_id()].get("ready", false)):
		return
	if elapsed - _last_ready_request > 1.0:
		_last_ready_request = elapsed
		Net.set_ready(true)
