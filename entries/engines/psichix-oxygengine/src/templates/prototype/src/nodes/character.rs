use crate::nodes::thunder::ThunderNode;
use oxygengine::prelude::{
    intuicio::derive::*,
    intuicio::{core as intuicio_core, data as intuicio_data, prelude::*},
    *,
};

#[derive(IntuicioStruct, Debug)]
#[intuicio(name = "CharacterNode", module_name = "game")]
pub struct CharacterNode {
    #[intuicio(ignore)]
    pub speed: Scalar,
    #[intuicio(ignore)]
    pub animation_speed: Scalar,
    #[intuicio(ignore)]
    pub animation_phase: Scalar,
    #[intuicio(ignore)]
    pub sprite: ScriptedNodeEntity,
    #[intuicio(ignore)]
    pub thunder: ScriptedNodeEntity,
}

impl Default for CharacterNode {
    fn default() -> Self {
        Self {
            speed: 1.0,
            animation_speed: 1.0,
            animation_phase: 0.0,
            sprite: Default::default(),
            thunder: Default::default(),
        }
    }
}

impl CharacterNode {
    pub fn install(registry: &mut Registry) {
        registry.add_struct(Self::define_struct(registry));
        registry.add_function(Self::event_update__define_function(registry));
    }
}

#[intuicio_methods(module_name = "game")]
impl CharacterNode {
    #[intuicio_method(transformer = "DynamicManagedValueTransformer")]
    pub fn event_update(
        this: &mut Self,
        transform: &mut HaTransform,
        universe: &Universe,
        _entity: Entity,
    ) {
        let world = universe.world();
        let life_cycle = universe.expect_resource::<AppLifeCycle>();
        let inputs = universe.expect_resource::<InputController>();
        let camera = universe.expect_resource::<Camera>();
        let mut audio = universe.expect_resource_mut::<AudioPlayer>();
        let dt = life_cycle.delta_time_seconds();
        let direction =
            Vec2::from(inputs.mirror_multi_axis_or_default([
                ("move-right", "move-left"),
                ("move-down", "move-up"),
            ]));
        let pointer = Vec2::from(inputs.multi_axis_or_default(["mouse-x", "mouse-y"]));
        let pointer = camera.screen_to_camera_point(pointer) - camera.world_size() * 0.5;
        let mouse_action = inputs.trigger_or_default("mouse-action");

        if let Some(dir) = direction.try_normalized() {
            transform.change_translation(|position| *position += dir * this.speed * dt);
            this.animation_phase += dt * this.animation_speed;
            this.sprite
                .with_mut::<SpriteNode, (), _>(&world, |node, _| {
                    if dir.x.abs() > 0.0 {
                        node.mirror_x = dir.x < 0.0;
                    }
                    node.region = SpriteNodeRegion::AnimationFrame {
                        frame: this.animation_phase as usize % 4,
                        cols: 4,
                        rows: 1,
                    };
                    Some(())
                });
        }

        if mouse_action.is_pressed() {
            audio.play(crate::assets::audio::POP, 1.0);
        }

        this.thunder.node_mut::<(), _>(&world, |node, _| {
            node.active = mouse_action.is_hold();
        });

        this.thunder
            .with_mut::<ThunderNode, (), _>(&world, |node, _| {
                node.target = pointer;
            });
    }
}
