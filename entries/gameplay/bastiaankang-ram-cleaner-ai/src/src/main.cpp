// main.cpp — entry point. Wires config and subsystems together.

#include "ramcleanerai/settings.h"
#include "ramcleanerai/monitor.h"
#include "ramcleanerai/smart.h"
#include "ramcleanerai/protect.h"
#include <csignal>
#include <memory>

namespace { std::atomic<bool> g_running{true}; void on_signal(int) { g_running.store(false); } }

int main(int argc, char** argv) {
    std::signal(SIGINT, on_signal);
    std::signal(SIGTERM, on_signal);

    ramcleanerai::Settings settings = ramcleanerai::Settings::load_default();
    ramcleanerai::Monitor monitor(settings.store_path);
    ramcleanerai::Smart smart(settings.store_path);
    ramcleanerai::Protect protect(settings.store_path);
    std::fprintf(stderr, "[ram-cleaner-ai] ready\n");

    while (g_running.load()) {
        // main loop: pump subsystems
        break;
    }
    return 0;
}
