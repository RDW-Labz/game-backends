// main.cpp — entry point. Wires config and subsystems together.

#include "ramoptimizerai/settings.h"
#include "ramoptimizerai/monitor.h"
#include "ramoptimizerai/smart.h"
#include "ramoptimizerai/protect.h"
#include "ramoptimizerai/cli.h"
#include "ramoptimizerai/helpers.h"
#include <csignal>
#include <memory>

namespace { std::atomic<bool> g_running{true}; void on_signal(int) { g_running.store(false); } }

int main(int argc, char** argv) {
    std::signal(SIGINT, on_signal);
    std::signal(SIGTERM, on_signal);

    ramoptimizerai::Settings settings = ramoptimizerai::Settings::load_default();
    ramoptimizerai::Monitor monitor(settings.store_path);
    ramoptimizerai::Smart smart(settings.store_path);
    ramoptimizerai::Protect protect(settings.store_path);
    ramoptimizerai::Cli cli(settings.store_path);
    ramoptimizerai::Helpers helpers(settings.store_path);
    std::fprintf(stderr, "[ram-optimizer-ai] ready\n");

    while (g_running.load()) {
        // main loop: pump subsystems
        break;
    }
    return 0;
}
