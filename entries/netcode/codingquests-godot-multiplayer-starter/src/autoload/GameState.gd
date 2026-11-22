extends Node
## Round state every peer can read: LOBBY, IN_RUN or ENDED, the round number and
## the time left. Only the server changes it; the MultiplayerSynchronizer in
## GameState.tscn copies it to every client.

enum Phase { LOBBY, IN_RUN, ENDED }

signal phase_changed(value: int)
signal time_changed(value: float)

## How long a round lasts, in seconds.
const RUN_SECONDS: float = 180.0

@export var round_id: int = 0
@export var phase: int = Phase.LOBBY:
	set(value):
		if phase != value:
			phase = value
			phase_changed.emit(value)
@export var seconds_left: float = RUN_SECONDS:
	set(value):
		if seconds_left != value:
			seconds_left = value
			time_changed.emit(value)


func _process(delta: float) -> void:
	if Net.is_server() and phase == Phase.IN_RUN:
		seconds_left = maxf(0.0, seconds_left - delta)
		if seconds_left == 0.0:
			end_run()


func begin_run() -> bool:
	if not Net.is_server() or phase != Phase.LOBBY:
		return false
	seconds_left = RUN_SECONDS
	round_id += 1
	phase = Phase.IN_RUN
	return true


func end_run() -> void:
	if Net.is_server() and phase == Phase.IN_RUN:
		phase = Phase.ENDED


func return_to_lobby() -> void:
	if Net.is_server() and phase == Phase.ENDED:
		phase = Phase.LOBBY


func reset_session() -> void:
	phase = Phase.LOBBY
	seconds_left = RUN_SECONDS
