extends CanvasLayer
## Host, join, ready up and start. Visible while the game is in the lobby phase.
@onready var panel: PanelContainer = $Panel
@onready var status: Label = $Panel/Rows/Status
@onready var name_entry: LineEdit = $Panel/Rows/Name
@onready var address: LineEdit = $Panel/Rows/Address

func _ready() -> void:
	name_entry.text = Net.local_name
	$Panel/Rows/Host.pressed.connect(_host)
	$Panel/Rows/Join.pressed.connect(_join)
	$Panel/Rows/Leave.pressed.connect(func(): Net.leave_game("You left the session."))
	$Panel/Rows/Ready.pressed.connect(func(): Net.set_ready(not bool(Net.peers.get(Net.my_id(), {}).get("ready", false))))
	$Panel/Rows/Start.pressed.connect(func(): SessionFlow.start_run())

func _host() -> void:
	Net.local_name = name_entry.text.strip_edges().left(24)
	Net.host_game()

func _join() -> void:
	Net.local_name = name_entry.text.strip_edges().left(24)
	Net.join_game(address.text.strip_edges())

func _process(_delta: float) -> void:
	if Net.is_dedicated:
		panel.hide()
		return
	panel.visible = GameState.phase == GameState.Phase.LOBBY
	$Panel/Rows/Host.disabled = Net.has_session() or Net.is_connecting()
	$Panel/Rows/Join.disabled = Net.has_session() or Net.is_connecting()
	var text: String = "Connecting..." if Net.is_connecting() else Net.last_error
	for id in Net.peers:
		text += "\n%s | %s" % [Net.peers[id]["name"], "ready" if Net.peers[id]["ready"] else "not ready"]
	status.text = text
	$Panel/Rows/Ready.disabled = not Net.peers.has(Net.my_id())
	$Panel/Rows/Start.disabled = not Net.can_start()
