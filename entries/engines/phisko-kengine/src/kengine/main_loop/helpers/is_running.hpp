#pragma once

// entt
#include <entt/entity/fwd.hpp>

namespace kengine::main_loop {
	KENGINE_MAIN_LOOP_EXPORT bool is_running(const entt::registry & r) noexcept;
}