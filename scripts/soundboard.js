// scripts/soundboard.js
Hooks.once("init", async () => {
  console.log("neroSound | init");

  game.settings.register("neroSound", "moods", {
    name: "Moods del Soundboard",
    scope: "world",
    config: false,
    type: Array,
    default: []
  })

    // Registrar partial explícitamente
  const audioCardTemplate = await fetch("modules/neroSound/templates/partials/audio-card.hbs")
    .then(r => r.text());
  Handlebars.registerPartial("audio-card", audioCardTemplate);
});

Hooks.on("getSceneControlButtons", (controls) => {
    try {
        console.log("neroSound | getSceneControlButtons");

        // Creamos un grupo de controles nuevo llamado "neroSounds"
        const groupName = "neroSounds";
        if (!controls[groupName]) {
        controls[groupName] = {
            name: groupName,
            title: "neroSound",
            icon: "fa-solid fa-headphones", // Ícono visible
            layer: null,
            tools: {},
        };
        }

        const group = controls[groupName];

        // Agregar un botón dentro del grupo
        group.tools.openSoundboard = {
            name: "openSoundboard",
            title: "Abrir Soundboard",
            icon: "fa-solid fa-music",
            order: Object.keys(controls[groupName].tools).length,
            button: true,
            visible: game.user.isGM,
            onChange: () => {
                console.log("neroSound | clic en el botón del soundboard");

                const existing = foundry.applications.instances.get("nero-soundboard-app");
                if (existing) return existing.close();
                else new NeroSoundboardApp().render({ force: true });        
            },
        };

        console.log("neroSound | tool agregado correctamente ✅");
    } catch (err) {
        console.error("neroSound | error en getSceneControlButtons:", err);
    }
});

Hooks.once("ready", () => console.log("neroSound | ready"));

const BaseApp = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

class NeroSoundboardApp extends BaseApp {
    static DEFAULT_OPTIONS = {
        id: "nero-soundboard-app",
        window: { title: " neroSound - Soundboard", resizable: true },
        position: { width: 400, height: 300 },
        classes: ["neroSoundApp"],
    };

    static PARTS = [
        {
            id: "main",
            template: "modules/neroSound/templates/soundboard.hbs"
        }
    ];

    constructor(options = {}) {
        super(options);

        // Estado interno de la app
        this.moods = foundry.utils.duplicate(game.settings.get("neroSound", "moods") || [])
        this.selectedMood = null;
    }

    // Nuevo: re-render que preserva la posición de scroll del contenedor de la app
    async renderPreserveScroll(options = {}) {
        // Priorizar el panel derecho de la app ('.content'), luego .window-content y finalmente fallback
        const root = this.element;
        const preferredSelector = ".content";
        const container = root?.querySelector?.(preferredSelector) ?? root?.querySelector?.(".window-content") ?? root ?? document.scrollingElement;
        const prevScroll = container?.scrollTop ?? window.scrollY ?? 0;
        await this.render(options);
        const newContainer = this.element?.querySelector?.(preferredSelector) ?? this.element?.querySelector?.(".window-content") ?? this.element ?? document.scrollingElement;
        if (newContainer) newContainer.scrollTop = prevScroll;
        else window.scrollTo(0, prevScroll);
    }

    async _prepareContext(_options) {
        const selectedMoodObj = this.moods.find(m => m.name === this.selectedMood) || null;
        return {
            moods: this.moods,
            selectedMood: selectedMoodObj,
            messageEmpty: "Select a mood to see the sounds",
        };
    }

    _onRender() {
        super._onRender();
        const app = this;
        
        const html = this.element;
        if (!html) return;

        const getMood = () => this.moods.find(m => m.name === this.selectedMood);

        // Preparar draggable al presionar (pointerdown) para evitar problemas con hijos no-draggables
        html.addEventListener("pointerdown", (ev) => {
            const card = ev.target?.closest?.(".audio-card");
            if (!card) return;
            // marcar como draggable justo antes del dragstart
            card.setAttribute("draggable", "true");
            card._neroPreparedForDrag = true;
        });

       // Asegurar dragend limpia el atributo draggable si quedó marcado (evita quedarse siempre draggable)
        html.addEventListener("dragend", (ev) => {
            const card = ev.target?.closest?.(".audio-card") || app._draggingCard;
            if (!card) return;
            card.removeAttribute("draggable");
            card._neroPreparedForDrag = false;
        });

        // Delegated dragstart/dragend sobre el contenedor para garantizar que arranque el drag
        html.addEventListener("dragstart", (ev) => {
            const card = ev.target?.closest?.(".audio-card");
            if (!card) return;
            if (card._neroDragStarted) return;
            card._neroDragStarted = true;

            const mood = getMood();
            const sourceBlockName = card.closest(".audio-block")?.dataset.blockName || null;
            let originalIndex = 0;
            if (sourceBlockName) {
                const block = (mood.blocks || []).find(b => b.name === sourceBlockName);
                originalIndex = (block?.audios || []).findIndex(a => a.name === card.dataset.name);
            } else {
                originalIndex = (mood.audios || []).findIndex(a => a.name === card.dataset.name);
            }

            try {
                ev.dataTransfer.setData("text/plain", JSON.stringify({
                    name: card.dataset.name,
                    sourceMood: this.selectedMood,
                    sourceBlock: sourceBlockName,
                    originalIndex: originalIndex
                }));
                ev.dataTransfer.effectAllowed = "move";
            } catch (e) {
                console.warn("neroSound | dragstart dataTransfer error:", e);
            }
        });

        html.addEventListener("dragend", (ev) => {
            const card = ev.target?.closest?.(".audio-card");
            if (card) card._neroDragStarted = false;
        });

        // ===== Selección de mood =====
        html.querySelectorAll(".mood-item").forEach(el => {
            el.addEventListener("click", () => {
                this.selectedMood = el.dataset.name;
                // mantener scroll al cambiar selección
                this.renderPreserveScroll();
            });
        });

        // ===== Crear nuevo mood =====
        html.querySelector(".new-mood-btn")?.addEventListener("click", () => {
            new Dialog({
                title: "Crear nuevo Mood",
                content: `
                    <form>
                        <div class="form-group">
                            <label>Nombre del Mood:</label>
                            <input type="text" name="moodName" required />
                        </div>
                        <div class="form-group">
                            <label>Color del Mood:</label>
                            <input type="color" name="moodColor" value="#DCB8FF" />
                        </div>
                    </form>
                `,
                buttons: {
                    create: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Crear",
                        callback: async (html) => {
                            const moodName = html.find('input[name="moodName"]').val().trim();
                            const moodColor = html.find('input[name="moodColor"]').val();
                            if (!moodName) return ui.notifications.warn("El nombre no puede estar vacío");
                            this.moods.push({ name: moodName, color: moodColor, audios: [], blocks: [] });
                            await game.settings.set("neroSound", "moods", this.moods);
                            this.selectedMood = moodName;
                            await this.renderPreserveScroll();
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" }
                },
                default: "create",
                classes: ["neroSoundDialog"]
            }).render(true);
        });

        // ===== Borrar mood =====
        html.querySelectorAll(".delete-mood-btn").forEach(el => {
            el.addEventListener("click", () => {
                const name = el.dataset.name;
                new Dialog({
                    title: "Delete Mood",
                    content: `<p>Are you sure you want to delete <strong>${name}</strong>?</p>`,
                    buttons: {
                        yes: {
                            icon: '<i class="fas fa-check"></i>',
                            label: "Yes",
                            callback: async () => {
                                this.moods = this.moods.filter(m => m.name !== name);
                                if (this.selectedMood === name) this.selectedMood = null;
                                await game.settings.set("neroSound", "moods", this.moods);
                                await this.renderPreserveScroll();
                            }
                        },
                        no: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
                    },
                    default: "no",
                    classes: ["neroSoundDialog"]
                }).render(true);
            });
        });

        // ===== Añadir audio al mood general desde sidebar =====
        html.querySelectorAll(".add-audio-btn").forEach(el => {
            el.addEventListener("click", ev => {
                const moodName = el.dataset.name; // El mood al que pertenece el audio

                new Dialog({
                title: `Add audio to ${moodName}`,
                content: `
                    <form>
                        <div class="form-group">
                            <label>Audio name:</label>
                            <input type="text" name="audioName" required />
                        </div>
                        <div class="form-group">
                            <label>Audio color:</label>
                            <input type="color" name="audioColor" value="#DCB8FF" />
                            </div>
                        <div class="form-group">
                            <label>Audio data:</label>
                            <input type="file" name="audioFile" accept="audio/*" required />
                            </div>
                        <div class="form-group">
                            <label>Image:</label>
                            <input type="file" name="audioImage" accept="image/*" />
                        </div>
                    </form>
                `,
                buttons: {
                    create: {
                    label: "Add",
                    callback: async (html) => {
                        const audioName = html.find('input[name="audioName"]').val().trim();
                        const audioColor = html.find('input[name="audioColor"]').val();
                        const audioFileInput = html.find('input[name="audioFile"]')[0].files[0];
                        const audioImageInput = html.find('input[name="audioImage"]')[0]?.files[0];

                        if (!audioName || !audioFileInput) return ui.notifications.warn("Some data is empty");

                        const FP = foundry.applications.apps.FilePicker.implementation;

                        const audioUpload = await FP.upload("data", "/neroSound/audio", audioFileInput, { bucket: null });
                        const imageUpload = audioImageInput
                        ? await FP.upload("data", "/neroSound/images", audioImageInput, { bucket: null })
                        : null;

                        const playlistName = `neroSound-${moodName}`;
                        let playlist = game.playlists.find(p => p.name === playlistName);

                        if(!playlist){
                            playlist = await Playlist.create({
                                name: playlistName,
                                mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
                            });
                        }

                        await playlist.createEmbeddedDocuments("PlaylistSound", [{
                            name: audioName,
                            path: audioUpload.path,
                            repeat: false,
                            volume: .8,
                        }])

                        const newAudio = {
                            name: audioName,
                            color: audioColor,
                            file: audioUpload.path,
                            volume: 0.8,
                            playing: false,
                            loop: false,
                            image: imageUpload?.path || null
                        };

                        // Buscar el mood y agregar el audio
                        const mood = app.moods.find(m => m.name === moodName);
                        if (!mood.audios) mood.audios = [];
                        mood.audios.push(newAudio);

                        // Guardar en game.settings
                        game.settings.set("neroSound", "moods", app.moods);

                        // Renderizar la app de nuevo
                        await app.renderPreserveScroll();
                    }
                    },
                    cancel: { label: "Cancel" }
                },
                default: "create",
                classes: ["neroSoundDialog"]
                }).render(true);

            });
        });

        // ===== Crear nuevo bloque =====
        html.querySelector(".add-block-btn")?.addEventListener("click", () => {
            const mood = getMood();
            if (!mood) return;

            new Dialog({
                title: `Crear nuevo bloque en "${mood.name}"`,
                content: `
                    <form>
                        <div class="form-group">
                            <label>Nombre del bloque:</label>
                            <input type="text" name="blockName" required />
                        </div>
                        <div class="form-group">
                            <label>Color del bloque:</label>
                            <input type="color" name="blockColor" value="#88c" />
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" name="darkFont"/> Texto oscuro</label>
                        </div>
                    </form>
                `,
                buttons: {
                    create: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Crear",
                        callback: async (html) => {
                             const blockName = html.find('input[name="blockName"]').val().trim();
                             const blockColor = html.find('input[name="blockColor"]').val();
                             const darkFont = html.find('input[name="darkFont"]').is(":checked");
 
                             if (!blockName) return ui.notifications.warn("El nombre no puede estar vacío");
 
                             mood.blocks.push({
                                 name: blockName,
                                 color: blockColor,
                                 darkFont: darkFont,
                                 audios: [],
                                 expanded: true
                             });
 
                            await game.settings.set("neroSound", "moods", this.moods);
                            await this.renderPreserveScroll();
                         }
                     },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" }
                },
                default: "create",
                classes: ["neroSoundDialog"]
            }).render(true);
        });

        // ===== Función de reproducción y control de audio =====
        const applyAudioListeners = (card) => {
            const mood = getMood();
            const blockName = card.closest(".audio-block")?.dataset.blockName;
            const audios = blockName ? mood.blocks.find(b => b.name === blockName)?.audios : mood?.audios;
            if (!audios) return;

            const name = card.dataset.name;
            const audio = audios.find(a => a.name === name);
            if (!audio) return;

            const playlistName = `neroSound-${this.selectedMood}`;
            const playlist = game.playlists.find(p => p.name === playlistName);
            if (!playlist) return;
            const sound = playlist.sounds.find(s => s.name === audio.name);

            // Reproducir/pausar
            card.querySelector(".audio-clickable")?.addEventListener("click", async () => {
                if (!sound) return;

                // Si el sonido estaba sonando: parar y limpiar monitor
                if (sound.playing) {
                    await playlist.stopSound(sound);
                    audio.playing = false;
                    if (audio._monitor) {
                        clearInterval(audio._monitor);
                        delete audio._monitor;
                    }
                } else {
                    await playlist.playSound(sound);
                    audio.playing = true;

                    // Monitor que revisa si el sonido dejó de estar en game.audio.playing
                    if (audio._monitor) clearInterval(audio._monitor);
                    audio._monitor = setInterval(async () => {
                        const stillPlaying = Array.from(game.audio.playing.values()).some(s => s.src === sound.path && s.playing);
                        if (!stillPlaying) {
                            clearInterval(audio._monitor);
                            delete audio._monitor;
                            audio.playing = false;
                            await game.settings.set("neroSound", "moods", this.moods);
                            await this.renderPreserveScroll();
                        }
                    }, 400);
                }

                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });

            // Loop
            card.querySelector(".audio-loop-btn")?.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                audio.loop = !audio.loop;
                if (!sound) return;
                await sound.update({ repeat: audio.loop });
                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });

            // Pause/resume
            card.querySelector(".audio-pause-btn")?.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                if (!sound) return;
                const activeSound = Array.from(game.audio.playing.values()).find(s => s.src === sound.path);
                if (activeSound) {
                    if (activeSound.playing) {
                        activeSound.pause();
                        audio.playing = false;
                        if (audio._monitor) { clearInterval(audio._monitor); delete audio._monitor; }
                    } else {
                        await activeSound.play();
                        audio.playing = true;
                        if (audio._monitor) clearInterval(audio._monitor);
                        audio._monitor = setInterval(async () => {
                            const stillPlaying = Array.from(game.audio.playing.values()).some(s => s.src === sound.path && s.playing);
                            if (!stillPlaying) {
                                clearInterval(audio._monitor);
                                delete audio._monitor;
                                audio.playing = false;
                                await game.settings.set("neroSound", "moods", this.moods);
                                await this.renderPreserveScroll();
                            }
                        }, 400);
                    }
                } else {
                    await playlist.playSound(sound);
                    audio.playing = true;
                    if (audio._monitor) clearInterval(audio._monitor);
                    audio._monitor = setInterval(async () => {
                        const stillPlaying = Array.from(game.audio.playing.values()).some(s => s.src === sound.path && s.playing);
                        if (!stillPlaying) {
                            clearInterval(audio._monitor);
                            delete audio._monitor;
                            audio.playing = false;
                            await game.settings.set("neroSound", "moods", this.moods);
                            await this.renderPreserveScroll();
                        }
                    }, 400);
                }
                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });

            // Restart
            card.querySelector(".audio-restart-btn")?.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                if (!sound) return;
                await playlist.stopSound(sound);
                if (audio._monitor) { clearInterval(audio._monitor); delete audio._monitor; }
                await playlist.playSound(sound);
                audio.playing = true;

                // Monitor post-restart
                if (audio._monitor) clearInterval(audio._monitor);
                audio._monitor = setInterval(async () => {
                    const stillPlaying = Array.from(game.audio.playing.values()).some(s => s.src === sound.path && s.playing);
                    if (!stillPlaying) {
                        clearInterval(audio._monitor);
                        delete audio._monitor;
                        audio.playing = false;
                        await game.settings.set("neroSound", "moods", this.moods);
                        await this.renderPreserveScroll();
                    }
                }, 400);

                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });

            // Volume
            card.querySelector(".audio-volume")?.addEventListener("input", async (ev) => {
                const newVolume = parseFloat(ev.target.value);
                audio.volume = newVolume;
                if (sound) await sound.update({ volume: newVolume });
                await game.settings.set("neroSound", "moods", this.moods);
            });
            // Delete
            card.querySelector(".audio-delete-btn")?.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                if (!audio) return;
                new Dialog({
                    title: `Eliminar audio "${audio.name}"`,
                    content: `<p>Are you sure you want to delete this audio?</p>`,
                    buttons: {
                        yes: {
                            label: "Yes",
                            callback: async () => {
                                if (sound) await sound.delete();
                                if (blockName) {
                                    const block = mood.blocks.find(b => b.name === blockName);
                                    block.audios = block.audios.filter(a => a.name !== name);
                                } else {
                                    mood.audios = mood.audios.filter(a => a.name !== name);
                                }
                                await game.settings.set("neroSound", "moods", this.moods);
                                await this.renderPreserveScroll();
                            }
                        },
                        no: { label: "Cancel" }
                    },
                    default: "no",
                    classes: ["neroSoundDialog"]
                }).render(true);
            });

            card.querySelector(".audio-config-btn")?.addEventListener("click", async (ev) => {
                ev.stopPropagation();

                new Dialog({
                    title: `Configurar "${audio.name}"`,
                    content: `
                    <form>
                        <div class="form-group">
                        <label>Nombre:</label>
                        <input type="text" name="audioName" value="${audio.name}" />
                        </div>
                        <div class="form-group">
                        <label>Audio:</label>
                        <input type="file" name="audioFile" accept="audio/*" />
                        </div>
                        <div class="form-group">
                        <label>Imagen:</label>
                        <input type="file" name="audioImage" accept="image/*" />
                        </div>
                    </form>
                    `,
                    buttons: {
                        save: {
                            icon: '<i class="fas fa-check"></i>',
                            label: "Guardar",
                            callback: async (html) => {
                                const newName = html.find('input[name="audioName"]').val().trim();
                                const audioFileInput = html.find('input[name="audioFile"]')[0]?.files[0];
                                const audioImageInput = html.find('input[name="audioImage"]')[0]?.files[0];

                                if (!newName) return ui.notifications.warn("Nombre vacío");

                                const oldName = audio.name;
                                audio.name = newName;



                                const FP = foundry.applications.apps.FilePicker.implementation;

                                if (audioFileInput) {
                                    const uploadedAudio = await FP.upload("data", "neroSound/audio", audioFileInput);
                                    audio.file = uploadedAudio.path;
                                }

                                if (audioImageInput) {
                                    const uploadedImage = await FP.upload("data", "neroSound/images", audioImageInput);
                                    audio.image = uploadedImage.path;
                                }

                                const playlistName = `neroSound-${app.selectedMood}`;
                                const playlist = game.playlists.find(p => p.name === playlistName);
                                if (playlist) {
                                    const soundDoc = playlist.sounds.find(s => s.name === oldName);
                                    if (soundDoc) {
                                        await soundDoc.update({
                                            name: newName,
                                            path: audio.file
                                        });
                                    }
                                }

                                // Guardar settings y render
                                await game.settings.set("neroSound", "moods", app.moods);
                                await app.renderPreserveScroll();
                            }
                        },
                        cancel: { label: "Cancelar" }
                    },
                    default: "save",
                    classes: ["neroSoundDialog"]
                }).render(true);
            })
        };

        // ===== Aplicar listeners a todos los audio-cards =====
        html.querySelectorAll(".audio-card").forEach(card => {
            card.setAttribute("draggable", true);
            applyAudioListeners(card);

            // Dragstart/dragend en cada card: sólo setear dataTransfer, no tocamos estilos.
            card.addEventListener("dragstart", (ev) => {
                const mood = getMood();
                const sourceBlockName = card.closest(".audio-block")?.dataset.blockName || null;
                let originalIndex = 0;
                if (sourceBlockName) {
                    const block = (mood.blocks || []).find(b => b.name === sourceBlockName);
                    originalIndex = (block?.audios || []).findIndex(a => a.name === card.dataset.name);
                } else {
                    originalIndex = (mood.audios || []).findIndex(a => a.name === card.dataset.name);
                }
                card._neroDragStarted = true;
                try {
                    ev.dataTransfer.setData("text/plain", JSON.stringify({
                        name: card.dataset.name,
                        sourceMood: this.selectedMood,
                        sourceBlock: sourceBlockName,
                        originalIndex: originalIndex
                    }));
                    ev.dataTransfer.effectAllowed = "move";
                } catch (e) {
                    console.warn("neroSound | dragstart dataTransfer error:", e);
                }
            });
            card.addEventListener("dragend", () => {
                card._neroDragStarted = false;
            });
        });

        // ===== Drag & Drop bloques =====
        html.querySelectorAll(".block-contents").forEach(container => {
            container.addEventListener("dragover", ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
            container.addEventListener("drop", async ev => {
                ev.preventDefault();
                const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
                const mood = getMood();
                if (!mood) return;

                const blockName = container.closest(".audio-block")?.dataset.blockName;
                const block = mood.blocks.find(b => b.name === blockName);
                if (!block) return;

                let audio;
                if (data.sourceBlock) {
                    const sourceBlock = mood.blocks.find(b => b.name === data.sourceBlock);
                    audio = sourceBlock.audios.find(a => a.name === data.name);
                    sourceBlock.audios = sourceBlock.audios.filter(a => a.name !== data.name);
                } else {
                    audio = mood.audios.find(a => a.name === data.name);
                    mood.audios = mood.audios.filter(a => a.name !== data.name);
                }

                if (audio) block.audios.push(audio);
                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });
        });

        // ===== Drag & Drop audios generales =====
        html.querySelectorAll(".mood-audios-grid").forEach(container => {
            container.addEventListener("dragover", ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
            container.addEventListener("drop", async ev => {
                ev.preventDefault();
                const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
                const mood = getMood();
                if (!mood || !data.sourceBlock) return;

                const sourceBlock = mood.blocks.find(b => b.name === data.sourceBlock);
                if (!sourceBlock) return;

                const audio = sourceBlock.audios.find(a => a.name === data.name);
                sourceBlock.audios = sourceBlock.audios.filter(a => a.name !== data.name);
                mood.audios.push(audio);

                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });
        });

        // ===== Bloques: toggle, config y delete =====
        html.querySelectorAll(".block-header").forEach(header => {
            header.addEventListener("click", () => {
                const blockEl = header.closest(".audio-block");
                const blockName = blockEl.dataset.blockName;
                const mood = getMood();
                const block = mood.blocks.find(b => b.name === blockName);
                if (!block) return;

                block.expanded = !block.expanded;
                game.settings.set("neroSound", "moods", this.moods);

                const content = blockEl.querySelector(".block-contents");
                const toggle = header.querySelector(".block-toggle");
                content.style.display = block.expanded ? "grid" : "none";
                toggle.textContent = block.expanded ? "▼" : "►";
            });
        });

        html.querySelectorAll(".block-config-btn").forEach(btn => {
            btn.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                const blockEl = btn.closest(".audio-block");
                const blockName = blockEl.dataset.blockName;
                const mood = getMood();
                const block = mood.blocks.find(b => b.name === blockName);
                if (!block) return;

                new Dialog({
                    title: `Configurar bloque "${block.name}"`,
                    content: `
                        <form>
                            <div class="form-group">
                                <label>Nombre:</label>
                                <input type="text" name="blockName" value="${block.name}" />
                            </div>
                            <div class="form-group">
                                <label>Color:</label>
                                <input type="color" name="blockColor" value="${block.color}" />
                            </div>
                            <div class="form-group">
                                <label><input type="checkbox" name="darkFont" ${block.darkFont ? "checked" : ""}/> Texto oscuro</label>
                            </div>
                        </form>
                    `,
                    buttons: {
                        save: {
                            icon: '<i class="fas fa-check"></i>',
                            label: "Guardar",
                            callback: async (html) => {
                                block.name = html.find('input[name="blockName"]').val().trim();
                                block.color = html.find('input[name="blockColor"]').val();
                                block.darkFont = html.find('input[name="darkFont"]').is(":checked");
                                await game.settings.set("neroSound", "moods", this.moods);
                                await this.renderPreserveScroll();
                            }
                        },
                        cancel: { label: "Cancelar" }
                    },
                    default: "save",
                    classes: ["neroSoundDialog"]
                }).render(true);
            });
        });

        html.querySelectorAll(".block-delete-btn").forEach(btn => {
            btn.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                const blockEl = btn.closest(".audio-block");
                const blockName = blockEl.dataset.blockName;
                const mood = getMood();
                const block = mood.blocks.find(b => b.name === blockName);
                if (!block) return;

                const confirmed = await Dialog.confirm({
                    title: "Eliminar bloque",
                    content: `<p>¿Seguro que querés eliminar el bloque <b>${block.name}</b>?</p>`
                });
                if (!confirmed) return;

                if (block.audios?.length) mood.audios = [...(mood.audios || []), ...block.audios];
                mood.blocks = mood.blocks.filter(b => b.name !== block.name);
                await game.settings.set("neroSound", "moods", this.moods);
                await this.renderPreserveScroll();
            });
        });

        // ===== Inicializar bloques expand/collapse =====
        html.querySelectorAll(".audio-block").forEach(blockEl => {
            const blockName = blockEl.dataset.blockName;
            const block = getMood().blocks.find(b => b.name === blockName);
            const content = blockEl.querySelector(".block-contents");
            const toggle = blockEl.querySelector(".block-toggle");
            content.style.display = block.expanded ? "grid" : "none";
            toggle.textContent = block.expanded ? "▼" : "►";
        });

        // ===== Mejor Drag & Drop (reordenar / mover entre bloques / soltar en grid) =====
        const removeAudioFromSource = (mood, data) => {
            if (!data.sourceBlock) {
                const idx = (mood.audios || []).findIndex(a => a.name === data.name);
                if (idx !== -1) return mood.audios.splice(idx, 1)[0];
            } else {
                const srcBlock = (mood.blocks || []).find(b => b.name === data.sourceBlock);
                if (!srcBlock) return null;
                const idx = (srcBlock.audios || []).findIndex(a => a.name === data.name);
                if (idx !== -1) return srcBlock.audios.splice(idx, 1)[0];
            }
            return null;
        };

        const insertAt = (containerEl, ev, array, audio, data) => {
            if (!array) array = [];
            const rect = (containerEl && containerEl.getBoundingClientRect()) || { top: 0, left: 0 };
            const pointer = { x: ev.clientX, y: ev.clientY };

            // children visibles (el dragged está oculto por dragstart -> visibility:hidden)
            const children = Array.from(containerEl.querySelectorAll(".audio-card"));
            if (!children.length) {
                array.push(audio);
                return;
            }

            // buscar el child cuyo centro esté más cerca del puntero
            let closestIndex = 0;
            let minDist = Infinity;
            const centers = children.map((c, i) => {
                const r = c.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const dx = pointer.x - cx;
                const dy = pointer.y - cy;
                const dist = Math.hypot(dx, dy);
                if (dist < minDist) { minDist = dist; closestIndex = i; }
                return { cx, cy };
            });

            // decidir antes/después del closest según posición relativa al centro
            const center = centers[closestIndex];
            let index = closestIndex;
            const dx = pointer.x - center.cx;
            const dy = pointer.y - center.cy;
            // si el desplazamiento horizontal es mayor que el vertical, usar x para decidir (mejor para columnas)
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) index = closestIndex + 1;
            } else {
                if (dy > 0) index = closestIndex + 1;
            }

            // Ajustar índice si el origen y destino son el mismo array (reorden)
            try {
                const targetBlockName = containerEl.closest(".audio-block")?.dataset.blockName ?? null;
                const sourceBlockName = data?.sourceBlock ?? null;
                const sameMood = data && data.sourceMood === this.selectedMood;
                const sameBlock = sourceBlockName === targetBlockName;
                const sourceWasInMoodArray = !sourceBlockName && !targetBlockName;
                if (sameMood && (sameBlock || sourceWasInMoodArray) && typeof data.originalIndex === "number") {
                    if (data.originalIndex < index) index = Math.max(0, index - 1);
                }
            } catch (e) { /* ignore */ }

            if (index >= array.length) array.push(audio);
            else array.splice(index, 0, audio);
        };

        const attachDropTo = (containerEl, targetArrayGetter) => {
            containerEl.addEventListener("dragover", ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
            containerEl.addEventListener("drop", async ev => {
                ev.preventDefault();
                ev.stopPropagation();
                try {
                    const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
                    const mood = getMood();
                    if (!mood) return;

                    // remover del origen (si viene del mismo mood esto lo quita)
                    const audio = removeAudioFromSource(mood, data);
                    if (!audio) return;

                    const targetArray = targetArrayGetter(containerEl, mood) || [];
                    insertAt(containerEl, ev, targetArray, audio, data);

                    await game.settings.set("neroSound", "moods", this.moods);
                    await this.renderPreserveScroll();
                } catch (err) {
                    console.warn("neroSound | drop error:", err);
                }
            });
        };

        // Adjuntar a cada bloque (contenedor de audios dentro del bloque)
        html.querySelectorAll(".block-contents").forEach(container => {
            attachDropTo(container, (el, mood) => {
                const blockName = el.closest(".audio-block")?.dataset.blockName;
                const block = (mood.blocks || []).find(b => b.name === blockName);
                if (!block) return (block.audios = []);
                if (!block.audios) block.audios = [];
                return block.audios;
            });
        });

        // Permitir soltar sobre la card para insertar antes/después (usa ev para calcular índice)
        html.querySelectorAll(".audio-card").forEach(card => {
            card.addEventListener("dragover", ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
            card.addEventListener("drop", async ev => {
                ev.preventDefault();
                ev.stopPropagation();
                try {
                    const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
                    const mood = getMood();
                    if (!mood) return;

                    const audio = removeAudioFromSource(mood, data);
                    if (!audio) return;

                    const targetBlockName = card.closest(".audio-block")?.dataset.blockName;
                    const targetArray = targetBlockName
                        ? (mood.blocks.find(b => b.name === targetBlockName).audios ||= [])
                        : (mood.audios ||= []);

                    // Usar insertAt para considerar reorden dentro del mismo array
                    insertAt(card.parentElement, ev, targetArray, audio, data);

                    await game.settings.set("neroSound", "moods", this.moods);
                    await this.renderPreserveScroll();
                } catch (err) {
                    console.warn("neroSound | drop on card error:", err);
                }
            });
        });

        // Adjuntar al grid general (audios sueltos del mood)
        html.querySelectorAll(".audio-grid, .mood-audios-grid").forEach(container => {
            attachDropTo(container, (el, mood) => {
                if (!mood.audios) mood.audios = [];
                return mood.audios;
            });
        });

        // Permitir soltar en la zona del bloque completo (click/arrastre entre bloques): tratar como drop al block correspondiente
        html.querySelectorAll(".audio-block").forEach(blockEl => {
            blockEl.addEventListener("dragover", ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
            blockEl.addEventListener("drop", async ev => {
                ev.preventDefault();
                ev.stopPropagation();
                // manejar drop directamente (ev.dataTransfer es accesible)
                try {
                    const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
                    const mood = getMood();
                    if (!mood) return;
                    const blockName = blockEl.dataset.blockName;
                    const block = mood.blocks.find(b => b.name === blockName);
                    if (!block) return;

                    const audio = removeAudioFromSource(mood, data);
                    if (!audio) return;

                    const contents = blockEl.querySelector(".block-contents");
                    const targetArray = block.audios ||= [];
                    insertAt(contents || blockEl, ev, targetArray, audio, data);

                    await game.settings.set("neroSound", "moods", this.moods);
                    await this.renderPreserveScroll();
                } catch (err) {
                    console.warn("neroSound | block drop error:", err);
                }
            });
        });

        // Permitir soltar fuera de bloques (en el panel derecho) para mover al mood.audios
        html.querySelectorAll(".content").forEach(container => {
            attachDropTo(container, (el, mood) => {
                if (!mood.audios) mood.audios = [];
                return mood.audios;
            });
        });

    }

}