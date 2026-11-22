extends Node
## The connection: hosting, joining, the roster of players, ready-up, chat and
## emotes. This is the only script that creates or closes the ENet peer.
##
## The server (peer id 1) is the authority for everything. Clients send
## requests; the server checks each one and publishes the result.
##
## Session-control RPCs here go straight out. Application messages (chat,
## emotes) go through send_to(), which routes them through NetDebug so the lag
## dial (F4) can delay or drop them for testing.

const DEFAULT_PORT: int = 7654
const MAX_PLAYERS: int = 4

## Emitted on this machine once it is fully in a session: right away when
## hosting, and once the server has accepted us when joining.
signal session_ready
## Emitted whenever the session ends, with a reason to show the player.
signal session_closed(reason: String)
## Emitted when anyone joins, leaves, renames or changes ready state.
signal roster_changed
## Server only: a peer is leaving. Clean up its avatar before it is removed.
signal peer_leaving(id: int)
signal message_received(speaker: String, text: String)
signal emote_received(id: int, index: int)

var last_error: String = ""
var local_name: String = "Player"
## peer id -> {"name": String, "uid": String, "ready": bool}. The server owns
## this; clients receive copies through _receive_roster().
var peers: Dictionary = {}
var local_uid: String = ""
var session_id: String = ""
var _registered: bool = false
## True when started with --server: a headless host with no player of its own.
var is_dedicated: bool = false
var port_mapper: Node


func _ready() -> void:
	multiplayer.connected_to_server.connect(_connected)
	multiplayer.connection_failed.connect(func(): leave_game("Connection failed. Check the address and UDP port."))
	multiplayer.server_disconnected.connect(func(): leave_game("The host disconnected. Start a new session from the lobby."))
	local_uid = "%s-%s" % [Time.get_unix_time_from_system(), randi()]
	multiplayer.peer_disconnected.connect(_peer_disconnected)
	port_mapper = preload("res://scripts/net/PortMapper.gd").new()
	add_child(port_mapper)


## Start a server on `port`. A listen server keeps one slot for its own player;
## a dedicated server gives every slot to clients. UPnP asks the router to open
## the port for internet play; leave it off for LAN and local testing.
func host_game(port: int = DEFAULT_PORT, max_players: int = MAX_PLAYERS, use_upnp: bool = false) -> Error:
	leave_game()
	var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var slots: int = maxi(max_players - 1, 1)
	if is_dedicated:
		slots = max_players
	var err: Error = peer.create_server(port, slots)
	if err != OK:
		last_error = "Could not listen on UDP %d (error %d)." % [port, err]
		return err
	multiplayer.multiplayer_peer = peer
	session_id = "%s-%s" % [Time.get_unix_time_from_system(), randi()]
	if not is_dedicated:
		peers[1] = {"name": local_name, "uid": local_uid, "ready": false}
	_registered = true
	roster_changed.emit()
	print("[net] hosting UDP %d, authority %d" % [port, my_id()])
	if use_upnp:
		port_mapper.request_mapping(port)
	session_ready.emit()
	return OK


## Connect to a server. session_ready fires later, once the server accepts us.
func join_game(address: String = "127.0.0.1", port: int = DEFAULT_PORT) -> Error:
	leave_game()
	var peer: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var err: Error = peer.create_client(address, port)
	if err != OK:
		last_error = "Could not begin connection (error %d)." % err
		return err
	multiplayer.multiplayer_peer = peer
	return OK


func _connected() -> void:
	_register.rpc_id(1, local_name, local_uid)


func has_session() -> bool:
	var peer: MultiplayerPeer = multiplayer.multiplayer_peer
	return peer != null and not peer is OfflineMultiplayerPeer and peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED


func is_connecting() -> bool:
	var peer: MultiplayerPeer = multiplayer.multiplayer_peer
	return peer != null and not peer is OfflineMultiplayerPeer and peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTING


func is_server() -> bool:
	return has_session() and multiplayer.is_server()


func my_id() -> int:
	return multiplayer.get_unique_id() if has_session() else 0


## Close the connection and reset everything. Safe to call at any time.
func leave_game(reason: String = "") -> void:
	if is_instance_valid(port_mapper):
		port_mapper.release()
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	last_error = reason
	peers.clear()
	session_id = ""
	_registered = false
	roster_changed.emit()
	session_closed.emit(reason)


func peer_count() -> int:
	return peers.size()


# --- Joining: the server validates every registration ---------------------

## Sent by a newly connected client. The server rejects anyone already
## registered, or reusing another player's uid, and cleans the display name.
@rpc("any_peer", "call_remote", "reliable", 0)
func _register(display_name: String, uid: String) -> void:
	if not is_server():
		return
	var sender: int = multiplayer.get_remote_sender_id()
	if not multiplayer.get_peers().has(sender) or peers.has(sender):
		return
	var safe_uid: String = uid.left(80)
	for entry in peers.values():
		if entry["uid"] == safe_uid:
			return
	var safe_name: String = display_name.strip_edges().left(24)
	if safe_name.is_empty():
		safe_name = "Player"
	peers[sender] = {"name": safe_name, "uid": safe_uid, "ready": false}
	_publish_roster()


func _publish_roster() -> void:
	if not is_server():
		return
	roster_changed.emit()
	_receive_roster.rpc(peers, session_id)


## The server's copy of the roster, pushed to every client. Only the server
## (the multiplayer authority) can call this.
@rpc("authority", "call_remote", "reliable", 0)
func _receive_roster(snapshot: Dictionary, session: String) -> void:
	peers = snapshot.duplicate(true)
	session_id = session
	roster_changed.emit()
	if not _registered and peers.has(my_id()):
		_registered = true
		session_ready.emit()


func _peer_disconnected(id: int) -> void:
	if not is_server() or not peers.has(id):
		return
	# Remove the avatar first, then the roster entry.
	peer_leaving.emit(id)
	peers.erase(id)
	_publish_roster()


# --- Application messages (these go through the lag dial) ------------------

## Send an RPC to one peer (0 = everyone) through NetDebug, so the F4 dial can
## delay or drop it. A message from an old session is never delivered.
func send_to(target: int, node: Node, method: StringName, args: Array = []) -> void:
	if not has_session() or not is_instance_valid(node):
		return
	var epoch: String = session_id
	NetDebug.send(args, func(values: Array):
		if session_id == epoch:
			dispatch(target, node, method, values))


func dispatch(target: int, node: Node, method: StringName, args: Array) -> void:
	if not has_session() or not is_instance_valid(node) or not node.is_inside_tree():
		return
	if target != 0 and target != my_id() and not multiplayer.get_peers().has(target):
		return
	var call_args: Array = [target, method]
	call_args.append_array(args)
	node.callv("rpc_id", call_args)


func broadcast(node: Node, method: StringName, args: Array = []) -> void:
	send_to(0, node, method, args)


## Count a received application message for the network inspector (F3).
func note_received(args: Array = []) -> void:
	NetDebug.received_messages += 1
	NetDebug.received_payload_bytes += var_to_bytes(args).size()


## Chat. Every receiver checks that the sender is a registered player and cuts
## the text to 160 characters, so no client can post as someone else.
@rpc("any_peer", "call_local", "reliable", 0)
func post_message(text: String) -> void:
	var sender: int = multiplayer.get_remote_sender_id()
	if sender == 0:
		sender = my_id()
	if not peers.has(sender):
		return
	note_received([text])
	var speaker: String = str(peers[sender]["name"])
	message_received.emit(speaker, text.left(160))


## A quick emote over your head. Unreliable on its own channel (2): losing one
## does not matter, and it never waits behind chat or movement.
func emote(index: int) -> void:
	if not has_session():
		return
	emote_received.emit(my_id(), clampi(index, 0, 3))
	broadcast(self, &"_show_emote", [clampi(index, 0, 3)])


@rpc("any_peer", "call_remote", "unreliable", 2)
func _show_emote(index: int) -> void:
	var sender: int = multiplayer.get_remote_sender_id()
	if peers.has(sender):
		emote_received.emit(sender, clampi(index, 0, 3))


# --- Ready-up lobby -------------------------------------------------------

func set_ready(value: bool) -> void:
	if is_server():
		_apply_ready(1, value)
	elif has_session():
		_request_ready.rpc_id(1, value)


@rpc("any_peer", "call_remote", "reliable", 0)
func _request_ready(value: bool) -> void:
	if is_server():
		_apply_ready(multiplayer.get_remote_sender_id(), value)


## Server only. Ready state can only change in the lobby, and only for a
## registered player. A dedicated server starts the round when all are ready.
func _apply_ready(id: int, value: bool) -> void:
	if peers.has(id) and GameState.phase == GameState.Phase.LOBBY:
		peers[id]["ready"] = value
		_publish_roster()
		if is_dedicated and can_start():
			SessionFlow.start_run()


## True on the server when every player is ready and has loaded the world.
func can_start() -> bool:
	if not is_server() or peers.is_empty() or GameState.phase != GameState.Phase.LOBBY:
		return false
	for id in peers:
		if not bool(peers[id].get("ready", false)) or not SessionFlow.world_ready.has(id):
			return false
	return true


func reset_readiness() -> void:
	if not is_server():
		return
	for id in peers:
		peers[id]["ready"] = false
	_publish_roster()
