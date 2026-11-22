extends CharacterBody2D
## One player's avatar. The server owns every avatar (multiplayer authority 1)
## and is the only machine whose movement counts.
##
## How a move travels, every network tick (30 per second):
## 1. The owning client samples its input into a numbered command, moves right
##    away (prediction), and sends every unacknowledged command to the server.
## 2. The server checks each command, simulates at most one per tick, and
##    publishes server_state = {seq, position} through the synchronizer.
## 3. The owning client compares that with what it predicted for the same seq.
##    If they differ, it snaps to the server's answer and replays the commands
##    the server has not processed yet (reconciliation).
## 4. Everyone else draws this avatar 100 ms in the past, interpolating between
##    server positions (RemoteSmoother), so remote players move smoothly.

const SPEED: float = 220.0
const EMOTES: Array[String] = ["Hello!", "Here!", "Thanks!", "Help!"]
## One colour per roster slot. The roster is the same on every machine, so every
## window agrees on who is who.
const COLORS: Array[Color] = [Color("5b8cff"), Color("ff9f43"), Color("2ed573"), Color("ff6b9d")]

var owner_peer_id: int = 0
var is_local_player: bool = false
@export var round_id: int = 0
@export var server_position: Vector2 = Vector2.ZERO
@export var facing: float = 0.0
@export var server_state: Dictionary = {}

@onready var visual: Node2D = $Visual

var input: PlayerInput = PlayerInput.new()
var next_seq: int = 1
var processed_seq: int = 0
var commands: Dictionary = {}
var last_seen_seq: int = -1
var smoother: RemoteSmoother = RemoteSmoother.new()
var buffer: InputBuffer = InputBuffer.new()
var simulation_budget: int = 0
var correction_offset: Vector2 = Vector2.ZERO
var _emote_timer: SceneTreeTimer


func _enter_tree() -> void:
	owner_peer_id = str(name).to_int()
	set_multiplayer_authority(1)


func _ready() -> void:
	is_local_player = owner_peer_id == Net.my_id()
	SessionFlow.configure_sync($Sync)
	_update_name()
	Net.roster_changed.connect(_update_name)
	Net.emote_received.connect(_on_emote)
	$Camera.enabled = is_local_player
	NetTick.network_tick.connect(_on_tick)


func _update_name() -> void:
	$Name.text = str(Net.peers.get(owner_peer_id, {}).get("name", "Player"))
	var slot: int = Net.peers.keys().find(owner_peer_id)
	$Visual/Body.color = COLORS[slot % COLORS.size()] if slot >= 0 else Color(0.6, 0.6, 0.6)


func _on_emote(id: int, index: int) -> void:
	if id != owner_peer_id:
		return
	$Name.text = EMOTES[index]
	_emote_timer = get_tree().create_timer(1.5)
	var this_timer := _emote_timer
	this_timer.timeout.connect(func():
		if _emote_timer == this_timer:
			_update_name())


func _unhandled_input(event: InputEvent) -> void:
	if is_local_player and event.is_action_pressed("emote"):
		Net.emote(0)
		get_viewport().set_input_as_handled()


func _on_tick(tick: int) -> void:
	if GameState.phase != GameState.Phase.IN_RUN:
		return
	if is_local_player:
		if buffer.entries.size() < InputBuffer.CAPACITY:
			var command: Dictionary = input.sample(self, next_seq, tick)
			next_seq += 1
			if not Net.is_server():
				_apply_movement(command)
			buffer.push(command, position)
		if Net.is_server():
			for command in buffer.pending():
				_accept_command(owner_peer_id, command)
		else:
			# Resend everything unacknowledged: unreliable packets can be lost.
			Net.send_to(1, self, &"_push_inputs", [buffer.pending()])
	if Net.is_server():
		# One command is one fixed movement step. The server grants movement
		# time (one step per tick, a little banked for jitter), so a client that
		# floods commands cannot move faster than everyone else.
		simulation_budget = mini(simulation_budget + 1, 6)
		while simulation_budget > 0 and commands.has(processed_seq + 1):
			var seq: int = processed_seq + 1
			_simulate(commands[seq])
			commands.erase(seq)
			processed_seq = seq
			simulation_budget -= 1
		server_state = {"seq": processed_seq, "position": position}
		server_position = position
		if is_local_player:
			buffer.drop_through(processed_seq)


## Client -> server input batch. Unreliable but ordered, on its own channel (1)
## so a lost packet never stalls chat or the roster.
@rpc("any_peer", "call_remote", "unreliable_ordered", 1)
func _push_inputs(batch: Array) -> void:
	if not Net.is_server() or batch.size() > InputBuffer.CAPACITY:
		return
	Net.note_received([batch])
	for value in batch:
		if value is Dictionary:
			_accept_command(multiplayer.get_remote_sender_id(), value)


## Server-side validation. A command is dropped if it comes from anyone but the
## avatar's owner, belongs to another round, is a duplicate or far outside the
## expected sequence window, contains NaN or infinity, or asks to move faster
## than full stick.
func _accept_command(sender: int, command: Dictionary) -> bool:
	if not Net.is_server() or sender != owner_peer_id:
		return false
	if int(command.get("round", -1)) != round_id:
		return false
	var seq: int = int(command.get("seq", 0))
	if seq <= processed_seq or seq > processed_seq + 64 or commands.has(seq):
		return false
	var direction: Vector2 = Vector2(float(command.get("x", 0.0)), float(command.get("y", 0.0)))
	var angle: float = float(command.get("aim", 0.0))
	if not direction.is_finite() or not is_finite(angle):
		return false
	if direction.length() > 1.001:
		return false
	commands[seq] = {"seq": seq, "x": direction.x, "y": direction.y, "aim": angle,
		"sprint": bool(command.get("sprint", false))}
	return true


func _simulate(command: Dictionary) -> void:
	_apply_movement(command)
	facing = float(command.get("aim", facing))


## The one movement function, shared by the server's simulation, the client's
## prediction and the replay during reconciliation. If these ever differed, the
## client would be corrected every tick.
func _apply_movement(command: Dictionary) -> void:
	var direction: Vector2 = Vector2(float(command.get("x", 0.0)), float(command.get("y", 0.0))).limit_length()
	var speed: float = SPEED
	if bool(command.get("sprint", false)):
		speed *= 1.55
	velocity = direction * speed
	move_and_collide(velocity * NetTick.DELTA)


func _process(delta: float) -> void:
	visual.rotation = facing
	if Net.is_server():
		return
	var seq: int = int(server_state.get("seq", 0))
	var authoritative: Vector2 = server_state.get("position", server_position)
	if seq != last_seen_seq:
		last_seen_seq = seq
		if is_local_player:
			_reconcile(seq, authoritative)
		smoother.push(authoritative, Time.get_ticks_msec())
	if not is_local_player:
		position = smoother.sample(Time.get_ticks_msec(), position)
	# Ease the visual into a correction instead of teleporting the sprite.
	correction_offset = correction_offset.lerp(Vector2.ZERO, minf(delta * 12.0, 1.0))
	visual.position = correction_offset


func _reconcile(seq: int, authoritative: Vector2) -> void:
	var predicted: Variant = buffer.predicted_at(seq)
	buffer.drop_through(seq)
	if predicted != null and authoritative.distance_to(predicted) < 0.05:
		return
	var before: Vector2 = position
	if predicted != null:
		NetDebug.reconciliations += 1
		NetDebug.last_correction = authoritative.distance_to(predicted)
	position = authoritative
	for entry in buffer.entries:
		_apply_movement(entry["command"])
		entry["position"] = position
	correction_offset += before - position
	if correction_offset.length() > RemoteSmoother.SNAP_DISTANCE:
		correction_offset = Vector2.ZERO
