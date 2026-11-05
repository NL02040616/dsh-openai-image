window.__ModuleLoader__.load({
  id: '@local/dsh-openai-image',
  factory(require) {
    const React = require('react');
    /* SHARED_IMAGE_SIZING */
    const descriptions = {
      zh: {
        'gpt-image-2.5-flare': '速度优先：适合日常创作、快速出图和反复调整。支持参考图编辑与主体保留。',
        'gpt-image-2.5-sunburst': '质量优先：适合复杂画面、细节要求较高的作品和精细修改。支持参考图编辑与主体保留。',
        'gpt-image-1-mini': '经济型：GPT Image 1 的低成本版本，支持文字生图和参考图编辑；仅支持低输入保真度。官方已标记弃用。',
        usage: '上传图片后直接描述修改要求；不上传时继续修改最近一张图。输入“新建图片：…”可重新创作。',
        draw: '画图', once: '本次画图', drawTip: '只将下一次发送用于画图，保留当前聊天模型',
        cancel: '取消画图', newImage: '新建图片 · 不使用历史图片', references: '参考图：{count} 张（上方缩略图）',
        clear: '清空参考图', hint: '输入画面描述或修改要求，然后发送。完成后自动回到普通聊天。',
        edit: '继续修改', editTip: '将这张图片放入参考图栏，再输入修改要求', loading: '读取图片…',
        changed: '输入内容已变化，请再次点击“继续修改”。', unavailable: '当前无法编辑，请等待回复完成后重试。',
        unsupported: '只支持 PNG、JPEG 或 WebP 参考图。', failed: '无法读取参考图，请重试。',
        busy: '请等待当前回复完成', otherCommand: '请先完成或移除当前命令。',
        model: '生图模型', quality: '画质', size: '尺寸', low: '低 · 预览省费', medium: '中 · 平衡', high: '高 · 精细',
        square: '方图', landscape: '横图', portrait: '竖图', optionsLoading: '正在读取生图设置…',
        optionsFailed: '无法读取生图设置，暂不发送画图请求。', retry: '重试',
        costs: '本次 1 张。费用包含文字、参考图输入和图片输出；低画质适合先试稿。',
        pricing: '查看官方价格与估算', estimate: '官方估算不是最终账单；修改图片也会计费。',
        legacy: '当前使用插件默认参数；更改下方选项即可为本次画图单独设置。',
        followPrompt: '跟随描述中的尺寸/比例', custom: '自定义像素', actualSize: '本次请求尺寸',
        detected: '已从描述识别', fallback: '描述未指定，使用默认值', manual: '手动尺寸优先于描述',
        experimental: '高于 2K 的输出属于实验性尺寸，效果可能不稳定。', dimensions: '宽×高，例如 1536×864',
      },
      en: {
        'gpt-image-2.5-flare': 'Speed first: suited to everyday creation and quick iterations. Supports reference-image editing and subject preservation.',
        'gpt-image-2.5-sunburst': 'Quality first: suited to complex scenes, demanding detail, and precise edits. Supports reference-image editing and subject preservation.',
        'gpt-image-1-mini': 'Budget option: a cost-efficient GPT Image 1 variant for generation and editing. Only low input fidelity is supported. Officially deprecated.',
        usage: 'Upload images and describe the changes, or continue editing the latest image. Start with /new to create a fresh image.',
        draw: 'Draw', once: 'Draw once', drawTip: 'Use the next send for an image; keep your chat model selected',
        cancel: 'Cancel image', newImage: 'New image · no history images', references: 'References: {count} (thumbnails above)',
        clear: 'Clear references', hint: 'Describe the image or changes, then send. The next message returns to normal chat.',
        edit: 'Edit this image', editTip: 'Use this image as the reference, then describe your changes', loading: 'Loading image…',
        changed: 'The draft changed. Click Edit this image again.', unavailable: 'Wait for the current reply before editing.',
        unsupported: 'Use a PNG, JPEG or WebP reference image.', failed: 'Could not load the reference. Try again.',
        busy: 'Wait for the current reply', otherCommand: 'Finish or remove the current command first.',
        model: 'Image model', quality: 'Quality', size: 'Size', low: 'Low · preview', medium: 'Medium · balanced', high: 'High · detailed',
        square: 'Square', landscape: 'Landscape', portrait: 'Portrait', optionsLoading: 'Loading image settings…',
        optionsFailed: 'Image settings could not be loaded. No image request will be sent.', retry: 'Retry',
        costs: '1 image per send. Billing includes text, reference-image inputs and image output. Try low quality for drafts.',
        pricing: 'Official prices and estimates', estimate: 'Estimates are not the final bill. Image edits also incur charges.',
        legacy: 'Using plugin defaults. Change an option below to choose settings for this image.',
        followPrompt: 'Use dimensions / aspect ratio in prompt', custom: 'Custom pixels', actualSize: 'Requested dimensions',
        detected: 'Detected in prompt', fallback: 'No dimensions in prompt; using default', manual: 'Manual size overrides the prompt',
        experimental: 'Output above 2K is experimental; results can vary.', dimensions: 'Width × height, e.g. 1536×864',
      },
    };
    return {
      inject: ['slots', 'locale', 'conversation', 'connection', 'inputTriggers', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('openai-image', descriptions));
        const t = ctx.locale.bind('openai-image');
        const subscribe = listener => ctx.locale.subscribe(listener);
        const getSnapshot = () => ctx.locale.getSnapshot();
        const h = React.createElement;
        const active = draft => /^\/(?:image|draw)(?:\s|$)/.test(draft);
        const editable = input => input && !['adjudicating', 'submitting'].includes(input.phase);
        const buttonStyle = { font: 'inherit', fontSize: 12, borderRadius: 16, padding: '5px 10px', cursor: 'pointer', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-button-floating-fill)', border: '1px solid var(--dsw-alias-border-l3)' };
        function useCopy() { React.useSyncExternalStore(subscribe, getSnapshot); return t; }
        // Selections live in this browser, per conversation. Sending snapshots them
        // into one command; no asynchronous write to shared server defaults.
        const choices = new Map();
        const listeners = new Set();
        let catalog = { status: 'loading' };
        let loadRevision = 0;
        const notify = () => { for (const listener of listeners) listener(); };
        const subscribeOptions = listener => { listeners.add(listener); return () => listeners.delete(listener); };
        const storageKey = id => `dsh.openaiImage.options.v1:${id}`;
        const valid = value => value && catalog.status === 'ready'
          && catalog.models.some(model => model.id === value.model)
          && catalog.qualities.includes(value.quality) && typeof value.size === 'string' && value.size.length <= 30
          && (value.sizeMode === undefined || ['prompt', 'manual'].includes(value.sizeMode));
        function selectionFor(id) {
          if (catalog.status !== 'ready') return null;
          if (!choices.has(id)) {
            try { const saved = JSON.parse(localStorage.getItem(storageKey(id))); if (valid(saved)) choices.set(id, saved); } catch {}
          }
          return valid(choices.get(id)) ? choices.get(id) : catalog.defaults;
        }
        function select(id, value) {
          if (!valid(value)) return;
          choices.set(id, value);
          try { localStorage.setItem(storageKey(id), JSON.stringify(value)); } catch {}
          notify();
        }
        async function loadOptions() {
          const revision = ++loadRevision;
          catalog = { status: 'loading' }; notify();
          try {
            const response = await fetch('api/openai-image.options', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = { ok: true, value: await response.json() };
            if (revision !== loadRevision) return;
            if (!result.ok || !Array.isArray(result.value?.models) || !Array.isArray(result.value?.qualities) || !Array.isArray(result.value?.sizes)) throw new Error('Invalid settings');
            catalog = { ...result.value, status: 'ready' };
            if (!valid(catalog.defaults)) throw new Error('Invalid defaults');
          } catch (error) { if (revision === loadRevision) catalog = { status: 'error', detail: String(error.message).slice(0, 160) }; }
          if (revision === loadRevision) notify();
        }
        ctx.effect(() => { void loadOptions(); return () => { loadRevision++; listeners.clear(); }; });
        ctx.on('connection/reset', loadOptions);
        function useOptions(id) {
          React.useSyncExternalStore(subscribeOptions, () => catalog);
          return React.useSyncExternalStore(subscribeOptions, () => selectionFor(id));
        }
        function claim(session) {
          return {
            name: 'draw', token: '/draw ', hint: t('hint'), attachments: true,
            async submit(prompt, _actx, attachments = []) {
              const options = selectionFor(session.sessionId);
              if (!options) return { kind: 'error', text: t('optionsFailed') };
              let size;
              try { size = sizing.resolve({ ...options, prompt }).size; }
              catch (error) { return { kind: 'error', text: error.message }; }
              const line = '/image @dsh-image-options-v1 ' + JSON.stringify({ ...options, size, sizeMode: 'manual', prompt });
              const result = await ctx.remote.commands.execute(session.sessionId, line, attachments);
              if (!result.ok) throw new Error(result.error.message);
              return result.value?.result ?? { kind: 'error', text: t('optionsFailed') };
            },
          };
        }
        // Use a dedicated public claim so DSH still owns Enter, attachment admission,
        // draft restoration and the busy/submitting phase. /image remains compatible.
        ctx.effect(() => ctx.inputTriggers.registerSource({
          trigger: '/', name: 'openai-image-draw', candidates: async () => [], onPick: () => {},
          matchSpace: (session, token) => token === '/draw' ? { claim: claim(session) } : undefined,
          matchClaim: (session, token) => token === '/draw' ? claim(session) : undefined,
          matchEnter: (session, line) => /^\/draw(?:\s|$)/.test(line.trimStart()) ? { claim: claim(session) } : undefined,
        }));
        function arm(input, inputActions) {
          if (!editable(input)) throw new Error(t('unavailable'));
          if (/^\//.test(input.draft) && !active(input.draft)) throw new Error(t('otherCommand'));
          if (/^\/draw(?:\s|$)/.test(input.draft)) return;
          const removed = input.draft.match(/^\/image(?:\s|$)/)?.[0].length ?? 0;
          inputActions.setDraft({ text: `/draw ${input.draft.slice(removed)}`, references: input.occurrences.map(ref => ({ ...ref, offset: ref.offset + 6 - removed })), command: { token: '/draw' } });
        }
        function cancel(input, inputActions) {
          const removed = input.draft.match(/^\/(?:image|draw)(?:\s|$)/)?.[0].length ?? 0;
          inputActions.setDraft({ text: input.draft.slice(removed), references: input.occurrences.map(ref => ({ ...ref, offset: ref.offset - removed })) });
        }
        function DrawButton({ useInput, useSession, inputActions }) {
          useCopy();
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          const [error, setError] = React.useState('');
          const selected = active(input?.draft ?? '');
          return h('span', { style: { display: 'inline-flex', gap: 6, alignItems: 'center' } },
            h('button', { type: 'button', style: { ...buttonStyle, color: selected ? 'var(--dsw-alias-state-business-primary)' : buttonStyle.color },
              'aria-pressed': selected, title: running ? t('busy') : t('drawTip'), disabled: running || !editable(input),
              onClick: () => { try { setError(''); selected ? cancel(input, inputActions) : arm(input, inputActions); } catch (error) { setError(error.message); } },
            }, selected ? t('once') : `🎨 ${t('draw')}`),
            error && h('span', { role: 'alert', style: { fontSize: 12 } }, error));
        }
        function ReferenceDock({ useInput, useSession, inputActions, sessionId }) {
          useCopy();
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          const selectedOptions = useOptions(sessionId);
          const [custom, setCustom] = React.useState(false);
          if (!input || !active(input.draft)) return null;
          const legacy = /^\/image(?:\s|$)/.test(input.draft);
          const options = legacy && catalog.status === 'ready' ? catalog.defaults : selectedOptions;
          const choose = (key, value) => { arm(input, inputActions); select(sessionId, { ...options, [key]: value }); };
          let resolved, sizeError;
          if (options) {
            try { resolved = sizing.resolve({ ...options, prompt: input.draft.replace(/^\/(?:image|draw)\s*/, '') }); }
            catch (error) { sizeError = error.message; }
          }
          const chooseSize = value => {
            arm(input, inputActions);
            setCustom(value === 'custom');
            select(sessionId, { ...options, sizeMode: value === 'prompt' ? 'prompt' : 'manual', size: ['prompt', 'custom'].includes(value) ? options.size : value });
          };
          const availableSizes = options?.model === 'gpt-image-1-mini' ? sizing.standard : catalog.sizes;
          const sizeValue = options?.sizeMode !== 'manual' ? 'prompt' : custom || !availableSizes?.includes(options?.size) ? 'custom' : options.size;
          const picker = (key, values, label) => h('label', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, t(key),
            h('select', { 'aria-label': t(key), value: options[key], disabled: running || !editable(input), style: { ...buttonStyle, maxWidth: '100%' }, onChange: event => choose(key, event.target.value) },
              values.map(value => h('option', { key: value, value, title: key === 'model' ? t(value) : undefined }, label(value)))));
          const images = ctx.conversation.resolveDraftAttachments(input.attachmentIds).filter(item => item.kind === 'image');
          const removeReferences = () => {
            for (const image of images) { inputActions.removeAttachment(image.id); ctx.conversation.releaseDraftAttachment(image.id); }
          };
          return h('div', { role: 'region', 'aria-label': t('once'), style: { boxSizing: 'border-box', width: 'calc(100% - 32px)', maxWidth: 'var(--dsh-composer-card-max-width, 760px)', margin: '8px auto 0', padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 12, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('strong', null, images.length ? t('references', { count: images.length }) : t('newImage')),
              images.length > 0 && h('button', { type: 'button', style: buttonStyle, disabled: running || !editable(input), onClick: removeReferences }, t('clear')),
              h('button', { type: 'button', style: buttonStyle, disabled: !editable(input), onClick: () => cancel(input, inputActions) }, t('cancel'))),
            options ? h(React.Fragment, null,
              legacy && h('div', { style: { marginTop: 8 } }, t('legacy')),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 } },
                picker('model', catalog.models.map(model => model.id), id => catalog.models.find(model => model.id === id).name.replace(' · 生图', '')),
                picker('quality', catalog.qualities, value => t(value)),
                h('label', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, t('size'),
                  h('select', { 'aria-label': t('size'), value: sizeValue, disabled: running || !editable(input), style: buttonStyle, onChange: event => chooseSize(event.target.value) },
                    h('option', { value: 'prompt' }, t('followPrompt')),
                    availableSizes.map(size => h('option', { key: size, value: size }, size.replace('x', ' × '))),
                    h('option', { value: 'custom' }, t('custom'))))),
              sizeValue === 'custom' && h('input', { 'aria-label': t('dimensions'), placeholder: t('dimensions'), value: options.size, maxLength: 30,
                disabled: running || !editable(input), style: { ...buttonStyle, marginTop: 8, width: 190 }, onChange: event => choose('size', event.target.value) }),
              h('div', { role: sizeError ? 'alert' : 'status', style: { marginTop: 8 } }, sizeError || `${t('actualSize')}：${resolved.size.replace('x', ' × ')} · ${t(options.sizeMode === 'manual' ? 'manual' : resolved.detected ? 'detected' : 'fallback')}`),
              resolved?.experimental && h('div', { style: { marginTop: 6 } }, t('experimental')),
              h('div', { style: { marginTop: 8 } }, t(options.model)),
              h('div', { style: { marginTop: 6 } }, t('costs'), ' ',
                h('a', { href: 'https://developers.openai.com/api/docs/guides/image-generation#calculating-costs', target: '_blank', rel: 'noopener noreferrer', title: t('estimate'), style: { color: 'var(--dsw-alias-state-business-primary)' } }, t('pricing'))))
              : h('div', { role: 'status', style: { marginTop: 8 } }, t(catalog.status === 'loading' ? 'optionsLoading' : 'optionsFailed'), catalog.detail && ` (${catalog.detail})`,
                catalog.status === 'error' && h('button', { type: 'button', style: buttonStyle, onClick: loadOptions }, t('retry'))),
            h('div', { style: { marginTop: 6 } }, t('hint')));
        }
        function EditableImages({ images, loadImage, align, compact, thumbnail, renderFactorySlot, useInput, useSession, inputActions, sessionId }) {
          useCopy();
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          const latest = React.useRef({ input, running });
          latest.current = { input, running };
          const [pending, setPending] = React.useState(null);
          const [error, setError] = React.useState('');
          const alive = React.useRef(true);
          React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
          async function edit(source) {
            if (pending || running || !editable(input)) return;
            const image = source.attachment;
            if (!image) return;
            const revision = input.draftRev;
            const previousIds = input.attachmentIds;
            setPending(image.attachmentId); setError('');
            try {
              if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType)) throw new Error(t('unsupported'));
              const url = await loadImage(image);
              const response = await fetch(url);
              if (!response.ok) throw new Error(t('failed'));
              const blob = await response.blob();
              if (!alive.current) return;
              const current = latest.current;
              if (current.running || !editable(current.input)) throw new Error(t('unavailable'));
              if (current.input.draftRev !== revision || current.input.attachmentIds !== previousIds) throw new Error(t('changed'));
              if (/^\//.test(current.input.draft) && !active(current.input.draft)) throw new Error(t('otherCommand'));
              const extension = image.mediaType === 'image/jpeg' ? 'jpg' : image.mediaType.split('/')[1];
              const drafts = ctx.conversation.createDrafts(sessionId, [new File([blob], image.name || `reference.${extension}`, { type: image.mediaType })]);
              if (!inputActions.addAttachments(drafts.map(item => item.id))) {
                ctx.conversation.releaseDraftAttachments(drafts);
                throw new Error(t('unavailable'));
              }
              // Only replace image references; keep unrelated files and all draft text.
              for (const old of ctx.conversation.resolveDraftAttachments(previousIds).filter(item => item.kind === 'image')) {
                inputActions.removeAttachment(old.id); ctx.conversation.releaseDraftAttachment(old.id);
              }
              arm(current.input, inputActions);
            } catch (error) { if (alive.current) setError(error.message || t('failed')); }
            finally { if (alive.current) setPending(null); }
          }
          if (compact || thumbnail || !inputActions) return renderFactorySlot('conversation.images.content', { images, loadImage, align, compact, thumbnail });
          return h('div', null,
            h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' } }, images.map(image =>
              h('div', { key: image.attachment?.attachmentId || image.preview?.url, style: { maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7 } },
                renderFactorySlot('conversation.images.content', { images: [image], loadImage, align }),
                image.attachment && h('button', { type: 'button', style: buttonStyle, title: t('editTip'), disabled: running || !editable(input) || pending !== null, onClick: () => edit(image) }, pending === image.attachment.attachmentId ? t('loading') : t('edit'))))),
            error && h('div', { role: 'alert', style: { fontSize: 12, marginTop: 6 } }, error));
        }
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'openai-image-draw', order: 30 }, DrawButton));
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'openai-image-references', order: 30 }, ReferenceDock));
        for (const name of ['conversation.chat.message.images', 'conversation.chat.user.images', 'tool.call.images']) {
          ctx.slots.inject(name, () => ctx.slots.register({ name, id: 'openai-image-edit', priority: 50 }, EditableImages));
        }
        function ImageModelLabel({ provider, model }) {
          React.useSyncExternalStore(subscribe, getSnapshot);
          if (provider.id !== 'openai-image' || !descriptions.en[model.id]) return model.name;
          const description = `${t(model.id)}\n\n${t('usage')}`;
          return React.createElement('span', {
            title: description,
            'aria-description': description,
            style: { display: 'inline-block' },
          }, model.name);
        }
        ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
          name: 'conversation.input.model.label', id: 'openai-image-capabilities', priority: -5,
        }, ImageModelLabel));
      },
    };
  },
});
