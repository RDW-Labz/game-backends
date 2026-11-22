extends Node
## The main scene. Builds the UI, then reads the launch arguments:
##
##   --host              host a session (you play too)
##   --join=ADDRESS      join a session, for example --join=127.0.0.1
##   --port=NUMBER       use another UDP port on both sides (default 7654)
##   --name=TEXT         your display name
##   --server            headless dedicated server: no local player
##   --bot               join 127.0.0.1 as a scripted test player
##   --upnp              when hosting, ask the router to open the port
##
## Arguments after -- also work in an exported executable. Customize Run
## Instances may put arguments in either array, so this reads both.

func _ready() -> void:
	var args: PackedStringArray = OS.get_cmdline_args() + OS.get_cmdline_user_args()
	var address: String = ""
	var port: int = Net.DEFAULT_PORT
	for arg in args:
		if arg.begins_with("--name="):
			Net.local_name = arg.substr(7)
		elif arg.begins_with("--join="):
			address = arg.substr(7)
		elif arg.begins_with("--port="):
			port = clampi(int(arg.substr(7)), 1024, 65535)
	if args.has("--bot"):
		if address.is_empty():
			address = "127.0.0.1"
		if Net.local_name == "Player":
			Net.local_name = "Bot"
	add_child(preload("res://scenes/ChatBox.tscn").instantiate())
	add_child(preload("res://scenes/Lobby.tscn").instantiate())
	add_child(preload("res://scenes/HUD.tscn").instantiate())
	Net.is_dedicated = args.has("--server")
	if Net.is_dedicated:
		var err: Error = Net.host_game(port, Net.MAX_PLAYERS, args.has("--upnp"))
		if err != OK:
			push_error(Net.last_error)
		return
	if not address.is_empty():
		Net.join_game(address, port)
	elif args.has("--host"):
		Net.host_game(port, Net.MAX_PLAYERS, args.has("--upnp"))
	if args.has("--bot"):
		add_child(preload("res://scripts/player/BotClient.gd").new())


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		Net.leave_game()
		get_tree().quit()
