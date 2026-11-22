extends CanvasLayer
## Chat: click the box, type, press Enter. Messages go through Net.post_message,
## which every receiver validates.
var lines: PackedStringArray = []
@onready var history: RichTextLabel = $Panel/Rows/History
@onready var entry: LineEdit = $Panel/Rows/Entry

func _ready() -> void:
	Net.message_received.connect(_receive)
	entry.text_submitted.connect(_submit)
	Net.session_closed.connect(func(_reason: String):
		lines.clear()
		history.text = "")

func _submit(text: String) -> void:
	if Net.has_session() and not text.strip_edges().is_empty():
		Net.broadcast(Net, &"post_message", [text.left(160)])
	entry.clear()
	entry.release_focus()

func _receive(speaker: String, text: String) -> void:
	lines.append("%s: %s" % [speaker, text])
	while lines.size() > 5:
		lines.remove_at(0)
	history.text = "\n".join(lines)
