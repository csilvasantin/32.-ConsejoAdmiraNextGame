/* Council speech: one visible turn owns both the text and the mouth.
 * Classic script (load before the integration); also importable by node:test.
 * Rendering is a small, feathered displacement of the original photograph's
 * mouth. No sprite, face replacement, generated teeth or idle overlay is used.
 */
(function (root) {
    'use strict';

    // Image pixels, never viewport pixels; the renderer scales both.
    // Leyendas: measured on assets/council-leyendas.jpg (1360×768).
    // Coetáneos: measured on assets/council-coetaneos.jpg (1280×720).
    // Elon Musk lip centre ≈ (181, 427), lip box ≈ 32×10.
    const SOURCE = Object.freeze({
        leyendas: /council-leyendas\.(?:jpg|jpeg|png)(?:[?#]|$)/i,
        coetaneos: /council-coetaneos\./i
    });
    const IMAGES = Object.freeze({
        leyendas: Object.freeze({ width: 1360, height: 768 }),
        coetaneos: Object.freeze({ width: 1280, height: 720 })
    });
    const ANCHORS = Object.freeze({
        leyendas: Object.freeze({
            'Steve Jobs':     Object.freeze({ x: 168,  y: 402, width: 27, height: 11, opening: 1.7 }),
            'Steve Wozniak':  Object.freeze({ x: 310,  y: 335, width: 32, height: 14, opening: 1.9 }),
            'Tim Cook':       Object.freeze({ x: 444,  y: 283, width: 23, height: 9,  opening: 1.4 }),
            'Warren Buffett': Object.freeze({ x: 609,  y: 280, width: 27, height: 11, opening: 1.6 }),
            'Walt Disney':    Object.freeze({ x: 780,  y: 264, width: 25, height: 13, opening: 1.7 }),
            'Dieter Rams':    Object.freeze({ x: 946,  y: 290, width: 22, height: 9,  opening: 1.3 }),
            'Howard Schultz': Object.freeze({ x: 1094, y: 329, width: 28, height: 12, opening: 1.7 }),
            'George Lucas':   Object.freeze({ x: 1223, y: 416, width: 25, height: 11, opening: 1.5 })
        }),
        coetaneos: Object.freeze({
            'Elon Musk': Object.freeze({ x: 181, y: 427, width: 32, height: 10, opening: 1.5 })
        })
    });
    function sceneFor(source) {
        const src = String(source || '');
        if (SOURCE.leyendas.test(src)) return 'leyendas';
        if (SOURCE.coetaneos.test(src)) return 'coetaneos';
        return '';
    }
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
        ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
    const graphemes = (text) => segmenter
        ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
    const noopMouth = Object.freeze({ draw() {}, hide() {}, destroy() {} });

    function createMouthRenderer({ scene, image, document: doc = root.document } = {}) {
        if (!scene || !image || !doc) return noopMouth;
        const canvas = doc.createElement('canvas');
        canvas.className = 'council-speech-mouth';
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, {
            position: 'absolute', pointerEvents: 'none', zIndex: '4', display: 'none',
            transform: 'none', border: '0', padding: '0', margin: '0', maxWidth: 'none'
        });
        scene.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) { canvas.remove(); return noopMouth; }
        let last = null;
        let destroyed = false;

        function hide() { last = null; canvas.style.display = 'none'; }
        function draw(persona, level) {
            // A new composition must have its own measured anchors. Fail closed
            // instead of animating a different person's face during image loads.
            const source = String(image.currentSrc || image.src || '');
            const gen = sceneFor(source);
            const spec = IMAGES[gen];
            const anchor = gen && ANCHORS[gen] && ANCHORS[gen][persona];
            if (destroyed || !anchor || !spec || !image.complete || !image.naturalWidth ||
                Math.abs(image.naturalWidth / image.naturalHeight - spec.width / spec.height) > .005 || level <= 0) {
                hide(); return;
            }
            last = { persona, level };
            const bounds = image.getBoundingClientRect();
            const stage = scene.getBoundingClientRect();
            if (!bounds.width || !bounds.height) { canvas.style.display = 'none'; return; }
            const sx = bounds.width / spec.width, sy = bounds.height / spec.height;
            const pad = 5, w = anchor.width + pad * 2, h = anchor.height + pad * 2;
            const left = anchor.x - w / 2, top = anchor.y - h / 2;
            const scale = Math.max(1, sx * Math.min(3, Number(root.devicePixelRatio) || 1));
            const pixelW = Math.ceil(w * scale), pixelH = Math.ceil(h * scale);
            if (canvas.width !== pixelW || canvas.height !== pixelH) {
                canvas.width = pixelW; canvas.height = pixelH;
            }
            Object.assign(canvas.style, {
                display: 'block', left: (bounds.left - stage.left + left * sx) + 'px',
                top: (bounds.top - stage.top + top * sy) + 'px',
                width: (w * sx) + 'px', height: (h * sy) + 'px'
            });
            canvas.dataset.persona = persona;
            const sourceScale = image.naturalWidth / spec.width;
            const patch = () => ctx.drawImage(image, left * sourceScale, top * sourceScale,
                w * sourceScale, h * sourceScale, 0, 0, w, h);
            ctx.setTransform(pixelW / w, 0, 0, pixelH / h, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'source-over';
            patch();
            const delta = anchor.opening * clamp(level, 0, 1), cy = h / 2;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(w / 2, cy + 1, anchor.width / 2 + 1, anchor.height / 2 + 2, 0, 0, Math.PI * 2);
            ctx.clip();
            // Retain upper lip/teeth from the actual image. Only the lower lip
            // moves, by at most 1.3–1.9 native image pixels.
            ctx.fillStyle = 'rgba(28, 15, 14, .9)';
            ctx.beginPath();
            ctx.ellipse(w / 2, cy + delta * .5, anchor.width * .36,
                .45 + delta * .65, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath(); ctx.rect(0, cy + delta, w, h); ctx.clip();
            ctx.translate(0, delta); patch();
            ctx.restore();
            // The crop merges into the original face; it has no rectangular edge.
            ctx.save();
            ctx.globalCompositeOperation = 'destination-in';
            ctx.translate(w / 2, h / 2); ctx.scale(w / 2, h / 2);
            const mask = ctx.createRadialGradient(0, 0, .52, 0, 0, 1);
            mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = mask; ctx.fillRect(-1, -1, 2, 2);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
        }
        const redraw = () => { if (last) draw(last.persona, last.level); };
        const observer = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(redraw) : null;
        if (observer) observer.observe(image);
        image.addEventListener('load', redraw);
        return {
            draw, hide, canvas,
            destroy() {
                destroyed = true; last = null;
                if (observer) observer.disconnect();
                image.removeEventListener('load', redraw); canvas.remove();
            }
        };
    }

    function create(options = {}) {
        const doc = options.document === undefined ? root.document : options.document;
        const clock = options.clock || {};
        const now = clock.now || (() => root.performance ? root.performance.now() : Date.now());
        const request = clock.requestFrame || (root.requestAnimationFrame
            ? root.requestAnimationFrame.bind(root) : fn => root.setTimeout(() => fn(now()), 16));
        const cancelFrame = clock.cancelFrame || (root.cancelAnimationFrame
            ? root.cancelAnimationFrame.bind(root) : root.clearTimeout.bind(root));
        const mouth = options.mouthRenderer || createMouthRenderer(options);
        const media = typeof root.matchMedia === 'function' ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
        let reduced = options.reducedMotion === undefined ? !!(media && media.matches) : !!options.reducedMotion;
        let visible = !doc || doc.visibilityState !== 'hidden';
        let generation = options.generation || 'leyendas';
        let selected = null, epoch = 0, token = null, turnId = null, persona = null, revision = null;
        let phase = 'idle', text = '', target = '', parts = [], cursor = 0, final = false;
        let frame = null, frameEpoch = 0, nextAt = 0, wordAt = 0, sounding = false, destroyed = false;
        let lastState = '';
        let workingOn = false, workingPersona = null, workingFrame = null, workingEpoch = 0, workingOrigin = 0;
        const pace = clamp(Number(options.characterMs) || 32, 12, 120);
        const valid = value => !destroyed && value != null && value === token;
        const hasAnchor = (gen, name) => !!(name && ANCHORS[gen] && ANCHORS[gen][name]);
        const mouthsBlocked = () => {
            if (typeof options.mouthsOff === 'function') return !!options.mouthsOff();
            if (options.mouthsOff === true) return true;
            return !!(doc && doc.body && doc.body.classList && doc.body.classList.contains('mouths-off'));
        };
        const revealing = () => phase === 'revealing';
        const speaking = () => !destroyed && visible && !reduced && hasAnchor(generation, persona) && revealing() && sounding;
        const canWorkMouth = () => !destroyed && visible && !reduced && !mouthsBlocked() && workingOn && hasAnchor(generation, workingPersona);
        const snapshot = () => Object.freeze({
            token, turnId, persona, selected, revision, state: visible ? phase : 'paused', text,
            targetText: target, complete: final && cursor === parts.length,
            speaking: speaking(), visible, reducedMotion: reduced, generation,
            working: workingOn ? workingPersona : null
        });
        function notify() {
            const value = snapshot();
            if (options.textElement) options.textElement.textContent = text;
            const stateKey = [token, value.state, value.speaking, persona, reduced, visible].join('|');
            if (stateKey !== lastState) {
                lastState = stateKey;
                if (typeof options.onState === 'function') options.onState(value);
            }
            if (typeof options.onUpdate === 'function') options.onUpdate(value);
        }
        function stopFrame() {
            frameEpoch += 1;
            if (frame !== null) { cancelFrame(frame); frame = null; }
            sounding = false; mouth.hide();
        }
        function stopWorkingFrame() {
            workingEpoch += 1;
            if (workingFrame !== null) { cancelFrame(workingFrame); workingFrame = null; }
        }
        function workLevel(at) {
            // Same bounded cosine as a spoken word, without a text clock.
            return .18 + .82 * (.5 - .5 * Math.cos((at - workingOrigin + 32) / 170 * Math.PI * 2));
        }
        function scheduleWorking() {
            if (!canWorkMouth() || revealing() || workingFrame !== null) return;
            const expected = workingEpoch;
            workingFrame = request(timestamp => workingTick(timestamp, expected));
        }
        function resumeWorking() { scheduleWorking(); }
        function workingTick(timestamp, expected) {
            if (destroyed || expected !== workingEpoch) return;
            workingFrame = null;
            if (!canWorkMouth()) {
                if (!speaking()) mouth.hide();
                return;
            }
            // A revealing text turn owns the lips. It resumes this loop when it ends.
            if (revealing()) return;
            const at = Number.isFinite(timestamp) ? timestamp : now();
            mouth.draw(workingPersona, workLevel(at));
            scheduleWorking();
        }
        function schedule() {
            if (!destroyed && visible && !reduced && cursor < parts.length && frame === null) {
                const expected = token;
                const expectedFrame = frameEpoch;
                frame = request(timestamp => tick(timestamp, expected, expectedFrame));
            }
        }
        function tick(timestamp, expected, expectedFrame) {
            // Cancellation may race a frame already delivered by the browser.
            if (!valid(expected) || expectedFrame !== frameEpoch) return;
            frame = null;
            if (!visible || reduced) { mouth.hide(); return; }
            const at = Number.isFinite(timestamp) ? timestamp : now();
            let changed = false;
            if (cursor < parts.length && at >= nextAt) {
                const char = parts[cursor++]; text += char;
                const letter = /[\p{L}\p{N}]/u.test(char);
                if (letter && !sounding) wordAt = at;
                sounding = letter;
                const delay = /[.!?…\n]/u.test(char) ? pace * 6 : /[,;:]/u.test(char) ? pace * 3 : pace;
                nextAt = at + delay;
                phase = 'revealing'; changed = true;
            }
            if (cursor >= parts.length) {
                sounding = false; phase = final ? 'idle' : 'waiting'; mouth.hide(); changed = true;
            } else if (speaking()) {
                // The cadence is bounded by text reveal; spaces/punctuation and
                // pauses between upstream chunks close the mouth immediately.
                const level = .18 + .82 * (.5 - .5 * Math.cos((at - wordAt + 32) / 170 * Math.PI * 2));
                mouth.draw(persona, level);
            } else mouth.hide();
            if (changed) notify();
            schedule();
            if (!revealing()) resumeWorking();
        }
        function consumeWithoutMotion() {
            stopFrame(); cursor = parts.length; text = target;
            phase = final ? 'idle' : (target ? 'waiting' : 'thinking'); notify();
        }
        function cancel({ clearText = false } = {}) {
            stopFrame(); stopWorkingFrame(); epoch += 1; token = null; turnId = null; revision = null;
            phase = 'idle'; final = false; parts = []; cursor = 0; target = '';
            if (clearText) text = '';
            notify();
            resumeWorking();
        }
        function select(value) {
            const name = String(value || '').trim() || null;
            if (name === selected) return snapshot();
            selected = name; persona = name; cancel({ clearText: true }); return snapshot();
        }
        function begin({ persona: name, turnId: id = null } = {}) {
            name = String(name || selected || '').trim();
            if (destroyed || !name || (selected && selected !== name)) return null;
            stopFrame(); epoch += 1; selected = name; persona = name;
            token = 'speech-' + epoch; turnId = id; revision = null;
            text = ''; target = ''; parts = []; cursor = 0; final = false; phase = 'thinking';
            nextAt = now(); notify(); return token;
        }
        function update(value, fullText, { final: isFinal = false, revision: nextRevision = null } = {}) {
            if (!valid(value)) return false;
            if (nextRevision !== null) {
                if (!Number.isFinite(nextRevision) || (revision !== null && nextRevision < revision)) return false;
                revision = nextRevision;
            }
            const incoming = String(fullText == null ? '' : fullText);
            // Streaming snapshots can repeat, arrive shorter or rewrite a partial
            // token. Never append duplicates; preserve only the shared prefix.
            const incomingParts = graphemes(incoming);
            let shared = 0;
            while (shared < cursor && shared < incomingParts.length && parts[shared] === incomingParts[shared]) shared += 1;
            if (shared < cursor) { cursor = shared; text = incomingParts.slice(0, cursor).join(''); }
            target = incoming; parts = incomingParts; final = !!isFinal;
            if (reduced) { consumeWithoutMotion(); return true; }
            if (cursor < parts.length) {
                if (phase !== 'revealing') nextAt = now();
                phase = 'revealing'; schedule();
            } else {
                stopFrame(); phase = final ? 'idle' : (target ? 'waiting' : 'thinking');
                resumeWorking();
            }
            notify(); return true;
        }
        function finish(value, fullText = target) { return update(value, fullText, { final: true }); }
        function restore({ persona: name = selected, turnId: id = null, text: saved = '', live = false } = {}) {
            if (destroyed) return false;
            select(name); stopFrame(); epoch += 1;
            // A restored in-flight message already owns a visible prefix. Keep a
            // valid turn so later chunks extend it without narrating it again.
            token = live === true ? 'speech-' + epoch : null; turnId = id; revision = null;
            persona = selected; text = String(saved); target = text; parts = graphemes(text);
            cursor = parts.length; final = live !== true; phase = live === true ? 'waiting' : 'idle';
            nextAt = now(); notify(); return true;
        }
        function setVisible(value) {
            const next = !!value; if (visible === next || destroyed) return;
            visible = next; stopFrame(); stopWorkingFrame(); nextAt = now(); notify();
            if (visible) { schedule(); resumeWorking(); }
        }
        function setReducedMotion(value) {
            const next = !!value; if (reduced === next || destroyed) return;
            reduced = next; stopWorkingFrame();
            if (reduced && token) consumeWithoutMotion();
            else { stopFrame(); notify(); schedule(); }
            if (reduced) { if (!speaking()) mouth.hide(); }
            else resumeWorking();
        }
        function setGeneration(value) {
            const next = String(value || ''); if (next === generation || destroyed) return;
            generation = next; cancel({ clearText: true });
        }
        function setWorking(name, on) {
            if (destroyed) return snapshot();
            const nextName = String(name || '').trim();
            const nextOn = !!on && !!nextName;
            if (nextOn === workingOn && (!nextOn || nextName === workingPersona)) return snapshot();
            workingOn = nextOn;
            workingPersona = nextOn ? nextName : null;
            workingOrigin = now();
            stopWorkingFrame();
            if (!nextOn && !speaking()) mouth.hide();
            resumeWorking();
            notify();
            return snapshot();
        }
        function fail(value) {
            if (!valid(value)) return false;
            stopFrame(); stopWorkingFrame(); epoch += 1; token = null; phase = 'error'; final = false;
            target = text; parts = graphemes(text); cursor = parts.length; notify();
            resumeWorking(); return true;
        }
        function mouthsClassChanged() {
            if (destroyed) return;
            stopWorkingFrame();
            if (mouthsBlocked()) { if (!speaking()) mouth.hide(); return; }
            resumeWorking();
        }
        const MouthObserver = options.MutationObserver || root.MutationObserver;
        let mouthObserver = null;
        if (doc && doc.body && typeof MouthObserver === 'function') {
            mouthObserver = new MouthObserver(mouthsClassChanged);
            mouthObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
        }
        const visibilityChanged = () => setVisible(doc.visibilityState !== 'hidden');
        const motionChanged = event => setReducedMotion(event.matches);
        if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', visibilityChanged);
        if (media && options.reducedMotion === undefined && media.addEventListener) media.addEventListener('change', motionChanged);
        return Object.freeze({
            select, begin, update, finish, restore, cancel, close: () => cancel({ clearText: true }),
            fail, setVisible, setReducedMotion, setGeneration, setWorking, snapshot,
            destroy() {
                if (destroyed) return;
                destroyed = true; workingOn = false; stopWorkingFrame();
                cancel(); mouth.destroy();
                if (mouthObserver) mouthObserver.disconnect();
                if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', visibilityChanged);
                if (media && media.removeEventListener) media.removeEventListener('change', motionChanged);
            }
        });
    }
    root.CouncilSpeech = Object.freeze({
        create, createMouthRenderer, anchors: ANCHORS, image: IMAGES.leyendas, images: IMAGES, version: '1.1.0'
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
