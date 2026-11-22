extends Node2D
## The shared world. The server spawns one avatar per player into Players, and
## the PlayerSpawner (a MultiplayerSpawner) creates the same node on every
## client. Avatars are named after their owner's peer id.

const PLAYER: PackedScene = preload("res://scenes/Player.tscn")

@onready var players: Node2D = $Players


func _ready() -> void:
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(-600, -380, 1200, 760), Color("171c24"))
	for x in range(-600, 601, 40):
		draw_line(Vector2(x, -380), Vector2(x, 380), Color("26303a"))
	for y in range(-380, 381, 40):
		draw_line(Vector2(-600, y), Vector2(600, y), Color("26303a"))
	draw_rect(Rect2(-590, -370, 1180, 740), Color("82968a"), false, 5.0)


## Server only: show every replicated world node to a peer whose world is ready.
func allow_peer(id: int) -> void:
	if not Net.is_server():
		return
	for node in get_tree().get_nodes_in_group("world_sync"):
		var sync: MultiplayerSynchronizer = node
		sync.set_visibility_for(id, true)


## Server only: create a player's avatar at a free spawn point.
func spawn_avatar(id: int) -> void:
	if not Net.is_server() or not Net.peers.has(id) or players.has_node(str(id)):
		return
	var avatar: CharacterBody2D = PLAYER.instantiate()
	avatar.name = str(id)
	# Reuse a free spawn point after disconnects instead of assuming count is a slot.
	for slot in range(12):
		var candidate: Vector2 = Vector2(-180 + (slot % 4) * 120, 60 + (slot / 4) * 100)
		var available: bool = true
		for existing in players.get_children():
			if candidate.distance_to(existing.position) < 36.0:
				available = false
		if available:
			avatar.position = candidate
			break
	avatar.server_position = avatar.position
	avatar.server_state = {"seq": 0, "position": avatar.position}
	avatar.round_id = GameState.round_id
	players.add_child(avatar)


func remove_player(id: int) -> void:
	if not Net.is_server():
		return
	var avatar: Node = players.get_node_or_null(str(id))
	if avatar != null:
		avatar.queue_free()


func clear_run() -> void:
	if not Net.is_server():
		return
	for child in players.get_children():
		# Remove now so the next round cannot see old names this frame.
		players.remove_child(child)
		child.queue_free()
