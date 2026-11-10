window.__ModuleLoader__.load({
  id: 'dsh-openai-image',
  factory(require) {
    const React = require('react');
    /* SHARED_IMAGE_SIZING */
    /* SHARED_IMAGE_HISTORY */
    /* SHARED_UPDATE_CLIENT */
    const descriptions = {
      zh: {
        'gpt-image-2.6-flare': '新一代速度优先：适合交互式创作和快速迭代，支持文字生图与参考图编辑。本插件输出静态 PNG；费用随画质、尺寸和参考图用量变化。',
        'gpt-image-2.6-sunburst': '新一代精细创作：适合复杂构图、细节表现和图片修改，支持文字生图与参考图编辑。本插件输出静态 PNG；费用随画质、尺寸和参考图用量变化。',
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
        generating: '正在生成图片…', editing: '正在修改图片…', completed: '图片已完成', generationFailed: '图片生成失败',
        cancelled: '已停止', interrupted: '生成已中断', noRetry: '不会自动重试；再次生成前请核对用量。',
        waitingImage: '完成后图片会显示在这里，可使用对话的停止按钮取消。', unknown: '未记录', configured: '使用插件默认设置',
        outputSize: '实际尺寸', compare: '对比版本', closeCompare: '收起对比', compareWith: '选择对比版本', currentVersion: '当前图片',
        version: '版本', historyHint: '列出当前对话已加载的成功图片；向上加载历史可查看更早版本。选择图片下方“继续修改”可从该版本开始。',
        basedOn: '参考版本', noVersions: '暂无其他已加载的图片可对比。', sizeMismatch: '实际尺寸与请求不同',
        reedit: '重新编辑', retryOriginal: '按原参数重试', retryCost: '按原模型、画质、尺寸和参考图生成一次，会产生新的 API 用量',
        recoverBusy: '正在恢复…', replaceDraft: '输入框已有内容。是否替换为这次画图的提示词、参考图和参数？', replace: '替换并编辑', keepDraft: '保留现有草稿',
        restored: '已恢复到输入框，修改后发送即可。尚未生成图片。', retried: '已提交一次重试，请查看新的生成卡片。',
        recoverChanged: '输入内容或会话已变化，未替换草稿，请重新点击。', recoverIncomplete: '历史参数不完整或已不可用，请补全后发送。',
        chooseRequired: '请选择（原值未记录或已不可用）', referenceMissing: '参考图 {index} 无法读取，未替换草稿，请检查附件。',
        updates: '插件更新', updateBadge: '有新版本', updateTitle: 'OpenAI 生图更新', installed: '已安装', latest: '最新版本',
        checkUpdate: '检查更新', checkingUpdate: '正在检查…', updateFailed: '暂时无法检查更新，请稍后手动重试。画图功能不受影响。',
        upToDate: '已是最新版本', notChecked: '启动后会自动检查，也可立即手动检查。', closeUpdate: '收起',
        copyGitee: '复制 Gitee 安装地址', copyGithub: '复制 GitHub 安装地址', copied: '已复制安装地址', copyFailed: '复制失败，请选中下方地址后复制。',
        openPlugins: '打开插件管理器', ignoreUpdate: '忽略此版本', updateIgnored: '已忽略此版本的提醒',
        compatibleDsh: '兼容当前 DSH', incompatibleDsh: '与当前 DSH 不兼容，请先核对并更新 DSH。', unknownDsh: '无法确认当前 DSH 版本，请先核对兼容性。',
        supportedDsh: '支持的 DSH 版本', updateInstructions: '在插件管理器中添加此安装地址；若提示已有副本，先记录自定义配置，再卸载旧副本并安装新版。按提示完整退出重启。',
        updateDuringImage: '图片正在生成，完成后再打开插件管理器更新。', updatePrivacy: '每天最多自动检查一次，优先 Gitee、GitHub 备用。只读取公开版本信息，不发送密钥或对话，不自动安装。',
      },
      en: {
        'gpt-image-2.6-flare': 'New generation, speed first: for interactive creation and quick iterations, with text-to-image generation and reference-image editing. This plugin outputs static PNGs. Cost varies with quality, dimensions and reference-image usage.',
        'gpt-image-2.6-sunburst': 'New generation, detailed visual work: for complex compositions, fine detail and image editing, with text and reference-image inputs. This plugin outputs static PNGs. Cost varies with quality, dimensions and reference-image usage.',
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
        generating: 'Generating image…', editing: 'Editing image…', completed: 'Image complete', generationFailed: 'Image generation failed',
        cancelled: 'Stopped', interrupted: 'Generation interrupted', noRetry: 'No automatic retry. Check usage before generating again.',
        waitingImage: 'Your image will appear here. Use the conversation stop button to cancel.', unknown: 'Not recorded', configured: 'Plugin defaults',
        outputSize: 'Actual dimensions', compare: 'Compare versions', closeCompare: 'Close comparison', compareWith: 'Choose a version', currentVersion: 'Current image',
        version: 'Version', historyHint: 'Successful images loaded in this conversation. Load older history for more versions. Use Edit this image to branch from any version.',
        basedOn: 'Reference version', noVersions: 'No other loaded images to compare.', sizeMismatch: 'Output dimensions differ from the request',
        reedit: 'Edit request', retryOriginal: 'Retry original request', retryCost: 'Generate once with the original model, quality, dimensions and references; incurs new API usage',
        recoverBusy: 'Restoring…', replaceDraft: 'The composer already contains a draft. Replace it with this request and its references and settings?', replace: 'Replace and edit', keepDraft: 'Keep draft',
        restored: 'Restored to the composer. Edit and send when ready. No image generated yet.', retried: 'One retry submitted. See the new generation card.',
        recoverChanged: 'The draft or conversation changed. Nothing replaced; try again.', recoverIncomplete: 'Some original settings are missing or unavailable. Complete them before sending.',
        chooseRequired: 'Select (original value missing or unavailable)', referenceMissing: 'Reference {index} could not be loaded. Draft unchanged; check the attachment.',
        updates: 'Plugin updates', updateBadge: 'Update available', updateTitle: 'OpenAI Images updates', installed: 'Installed', latest: 'Latest version',
        checkUpdate: 'Check for updates', checkingUpdate: 'Checking…', updateFailed: 'Updates could not be checked. Try again later; image creation is unaffected.',
        upToDate: 'Up to date', notChecked: 'An automatic check will run shortly. You can also check now.', closeUpdate: 'Close',
        copyGitee: 'Copy Gitee install URL', copyGithub: 'Copy GitHub install URL', copied: 'Install URL copied', copyFailed: 'Copy failed. Select and copy the URL below.',
        openPlugins: 'Open plugin manager', ignoreUpdate: 'Ignore this version', updateIgnored: 'Reminders for this version are ignored',
        compatibleDsh: 'Compatible with your DSH', incompatibleDsh: 'Incompatible with your DSH. Check and update DSH first.', unknownDsh: 'Your DSH version could not be determined. Check compatibility first.',
        supportedDsh: 'Supported DSH versions', updateInstructions: 'Add this URL in the plugin manager. If a copy is already installed, record custom settings, uninstall it and install the new version. Fully restart when prompted.',
        updateDuringImage: 'Wait for image creation to finish before opening the plugin manager to update.', updatePrivacy: 'Automatic checks run at most daily, using Gitee with GitHub as fallback. Only public version information is fetched. No keys or conversations are sent, and nothing is installed automatically.',
      },
    };
    return {
      inject: ['slots', 'locale', 'conversation', 'uiConversation', 'connection', 'inputTriggers', 'remote', 'remote.commands'],
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
        let updateStorage;
        try { updateStorage = localStorage; } catch {}
        const updates = createUpdateClient({ currentVersion: installedVersion, fetcher: (...args) => fetch(...args), storage: updateStorage });
        ctx.effect(() => { updates.start(); return () => updates.dispose(); });
        let openPluginManager;
        ctx.inject(['pluginNavigation'], scope => {
          openPluginManager = () => scope.pluginNavigation.openBundle('dsh-openai-image');
          scope.effect(() => () => { openPluginManager = undefined; });
        });
        function UpdatePanel({ useSession }) {
          useCopy();
          const state = React.useSyncExternalStore(updates.subscribe, updates.getSnapshot);
          const running = useSession(s => s.running);
          const [message, setMessage] = React.useState('');
          if (!state.open) return null;
          const result = state.result, release = result?.release;
          const newer = result?.status === 'available';
          const copy = async url => {
            try { await navigator.clipboard.writeText(url); setMessage(t('copied')); }
            catch { setMessage(t('copyFailed')); }
          };
          const notes = release?.notes?.[String(getSnapshot().active).startsWith('zh') ? 'zh' : 'en'] ?? [];
          return h('section', { 'aria-label': t('updateTitle'), style: { boxSizing: 'border-box', width: 'calc(100% - 32px)', maxWidth: 'var(--dsh-composer-card-max-width, 760px)', margin: '8px auto', padding: 12, border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 12, fontSize: 12, maxHeight: 260, overflowY: 'auto', color: 'var(--dsw-alias-label-primary)' } },
            h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 } },
              h('strong', null, t('updateTitle')), h('span', null, `${t('installed')} ${installedVersion}`),
              h('button', { type: 'button', style: buttonStyle, disabled: state.checking, onClick: () => { setMessage(''); return updates.check(); } }, t(state.checking ? 'checkingUpdate' : 'checkUpdate')),
              h('button', { type: 'button', style: buttonStyle, onClick: updates.close }, t('closeUpdate'))),
            h('p', { role: 'status' }, state.checking ? t('checkingUpdate') : t(!result ? 'notChecked' : result.status === 'error' ? 'updateFailed' : newer ? 'updateBadge' : 'upToDate')),
            release && h('div', null,
              h('div', null, `${t('latest')} ${release.version} · ${release.publishedAt} · ${result.source}`),
              h('div', null, t(result.compatibility === 'compatible' ? 'compatibleDsh' : result.compatibility === 'incompatible' ? 'incompatibleDsh' : 'unknownDsh')),
              h('div', null, `${t('supportedDsh')}：${release.dshVersions.join(', ')}`),
              h('ul', null, notes.map((line, i) => h('li', { key: i }, line))),
              newer && h('div', null,
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  ...['gitee', 'github'].map(source => h('button', { key: source, type: 'button', style: buttonStyle, disabled: result.compatibility !== 'compatible', onClick: () => copy(release.links[source]) }, t(source === 'gitee' ? 'copyGitee' : 'copyGithub'))),
                  h('button', { type: 'button', style: buttonStyle, disabled: running || !openPluginManager, onClick: () => { openPluginManager?.(); updates.close(); } }, t('openPlugins')),
                  h('button', { type: 'button', style: buttonStyle, onClick: updates.ignore }, t('ignoreUpdate'))),
                result.compatibility === 'compatible' && h('input', { 'aria-label': t('copyGitee'), readOnly: true, value: release.links.gitee, style: { boxSizing: 'border-box', width: '100%', marginTop: 8 }, onFocus: e => e.target.select() }),
                h('p', null, running ? t('updateDuringImage') : t('updateInstructions')),
                state.ignored === release.version && h('p', null, t('updateIgnored')))),
            message && h('p', { role: 'status' }, message), h('p', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('updatePrivacy')));
        }
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
          && catalog.qualities.includes(value.quality) && typeof value.size === 'string' && value.size.trim().length > 0 && value.size.length <= 30
          && (value.sizeMode === undefined || ['prompt', 'manual'].includes(value.sizeMode));
        function selectionFor(id) {
          if (catalog.status !== 'ready') return null;
          if (!choices.has(id)) {
            try { const saved = JSON.parse(localStorage.getItem(storageKey(id))); if (valid(saved) || saved?.recovery === true) choices.set(id, saved); } catch {}
          }
          return choices.get(id)?.recovery || valid(choices.get(id)) ? choices.get(id) : catalog.defaults;
        }
        function select(id, value) {
          if (!valid(value) && !value?.recovery) return;
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
              if (!valid(options)) return { kind: 'error', text: t('recoverIncomplete') };
              let size;
              try { size = sizing.resolve({ ...options, prompt }).size; }
              catch (error) { return { kind: 'error', text: error.message }; }
              const line = '/image @dsh-image-options-v1 ' + JSON.stringify({ ...options, size, sizeMode: 'manual', prompt, draftSize: options.size, draftSizeMode: options.sizeMode ?? 'prompt' });
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
          const updateState = React.useSyncExternalStore(updates.subscribe, updates.getSnapshot);
          const newer = updateState.result?.status === 'available' && updateState.ignored !== updateState.result.release.version;
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          const [error, setError] = React.useState('');
          const selected = active(input?.draft ?? '');
          return h('span', { style: { display: 'inline-flex', gap: 6, alignItems: 'center' } },
            h('button', { type: 'button', style: { ...buttonStyle, color: selected ? 'var(--dsw-alias-state-business-primary)' : buttonStyle.color },
              'aria-pressed': selected, title: running ? t('busy') : t('drawTip'), disabled: running || !editable(input),
              onClick: () => { try { setError(''); selected ? cancel(input, inputActions) : arm(input, inputActions); } catch (error) { setError(error.message); } },
            }, selected ? t('once') : `🎨 ${t('draw')}`),
            h('button', { type: 'button', style: { ...buttonStyle, color: newer ? 'var(--dsw-alias-state-business-primary)' : buttonStyle.color },
              'aria-label': t('updates'), title: t('updates'), 'aria-expanded': updateState.open, onClick: updates.toggle }, newer ? t('updateBadge') : 'ⓘ'),
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
              !values.includes(options[key]) && h('option', { value: options[key] ?? '', disabled: true }, t('chooseRequired')),
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
              !valid(options) && h('div', { role: 'alert', style: { marginTop: 8 } }, t('recoverIncomplete')),
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
        // 0.2.2's generic tool card flattens unknown blocks to JSON. Register a
        // keyed view so persisted native image blocks use the authorized gallery.
        function ImageToolResult(props) {
          const { block, phase } = props;
          useCopy();
          // The tool-detail view stays small; the turn-level card owns comparisons.
          const details = history.info(block, block?.meta);
          const images = history.images(block);
          return h('section', { 'aria-label': t('once'), style: { padding: '8px 0', maxWidth: '100%' } },
            h('div', { role: block?.isError ? 'alert' : 'status', style: { whiteSpace: 'pre-wrap', fontSize: 12 } }, details.text || t(phase === 'result' ? 'generationFailed' : 'generating')),
            images.length > 0 && h(EditableImages, { ...props, images, align: 'left' }));
        }
        const recovering = new Set();
        async function recoveryCommand(sessionId, command, callId) {
          const response = await ctx.remote.commands.execute(sessionId, `/${command} ${callId}`, []);
          if (!response.ok) throw new Error(response.error.message);
          const result = response.value?.result;
          if (result?.kind !== 'success') throw new Error(result?.text || t('failed'));
          return result.text;
        }
        function RecoveryActions({ state, sessionId, useInput, useSession, inputActions, loadImage }) {
          useCopy();
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          useOptions(sessionId);
          const [pending, setPending] = React.useState(false);
          const [message, setMessage] = React.useState('');
          const [confirmation, setConfirmation] = React.useState(null);
          const latest = React.useRef(); latest.current = { input, running, sessionId, callId: state.callId };
          const alive = React.useRef(false);
          React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
          const available = () => {
            const now = latest.current;
            if (!alive.current || now.sessionId !== sessionId || now.callId !== state.callId) throw new Error(t('recoverChanged'));
            if (now.running || !editable(now.input)) throw new Error(t('unavailable'));
            return now.input;
          };
          const fingerprint = value => JSON.stringify([value.draftRev, value.draft, value.attachmentIds, value.occurrences]);
          async function run(action) {
            if (recovering.has(sessionId)) return;
            recovering.add(sessionId); setPending(true); setMessage('');
            try { available(); await action(); }
            catch (error) { if (alive.current) setMessage(error.message || t('failed')); }
            finally { recovering.delete(sessionId); if (alive.current) setPending(false); }
          }
          async function restore(saved, replace = false) {
            const before = available();
            if (!replace && (before.draft.trim() || before.attachmentIds.length)) { setConfirmation(saved); return; }
            setConfirmation(null);
            if (catalog.status !== 'ready') throw new Error(t('optionsFailed'));
            if (!Array.isArray(saved.references) || (saved.operation === 'edit' && !saved.references.length)) throw new Error(t('recoverIncomplete'));
            const original = fingerprint(before);
            const previousIds = [...before.attachmentIds];
            const files = [];
            // Read everything first. A missing reference must never silently
            // turn an edit into a text-only generation, or replace half a draft.
            for (const [index, reference] of saved.references.entries()) {
              try {
                if (!reference?.attachmentId || !['image/png', 'image/jpeg', 'image/webp'].includes(reference.mediaType)) throw new Error('Invalid reference');
                const response = await fetch(await loadImage(reference), { signal: AbortSignal.timeout(30000) });
                if (!response.ok) throw new Error('Unreadable reference');
                files.push(new File([await response.blob()], reference.name || `reference-${index + 1}.${reference.mediaType === 'image/jpeg' ? 'jpg' : reference.mediaType.split('/')[1]}`, { type: reference.mediaType }));
              } catch { throw new Error(t('referenceMissing', { index: index + 1 })); }
            }
            if (fingerprint(available()) !== original) throw new Error(t('recoverChanged'));
            const drafts = ctx.conversation.createDrafts(sessionId, files);
            if (drafts.length !== files.length || !inputActions.addAttachments(drafts.map(item => item.id))) {
              ctx.conversation.releaseDraftAttachments(drafts); throw new Error(t('unavailable'));
            }
            for (const id of previousIds) { inputActions.removeAttachment(id); ctx.conversation.releaseDraftAttachment(id); }
            select(sessionId, { model: saved.model ?? '', quality: saved.quality ?? '', size: saved.draft?.size ?? saved.size ?? '',
              sizeMode: saved.draft?.sizeMode === 'prompt' ? 'prompt' : 'manual', recovery: true });
            inputActions.setDraft({ text: `/draw ${saved.draft?.prompt ?? saved.prompt ?? ''}`, references: [], command: { token: '/draw' } });
            inputActions.persistDraft?.();
            setMessage(t('restored'));
          }
          const edit = () => run(async () => {
            const original = fingerprint(available());
            const saved = JSON.parse(await recoveryCommand(sessionId, 'image-recover', state.callId));
            if (fingerprint(available()) !== original) throw new Error(t('recoverChanged'));
            await restore(saved);
          });
          const retry = () => run(async () => {
            setConfirmation(null);
            await recoveryCommand(sessionId, 'image-retry', state.callId);
            if (alive.current) setMessage(t('retried'));
          });
          const disabled = pending || running || !editable(input);
          return h('div', { style: { marginTop: 12 } },
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
              h('button', { type: 'button', style: buttonStyle, disabled, onClick: edit }, t(pending ? 'recoverBusy' : 'reedit')),
              h('button', { type: 'button', style: buttonStyle, disabled, title: t('retryCost'), onClick: retry }, t('retryOriginal'))),
            confirmation && h('div', { role: 'group', 'aria-label': t('replaceDraft'), style: { marginTop: 10 } },
              h('div', null, t('replaceDraft')),
              h('button', { type: 'button', style: buttonStyle, disabled, onClick: () => run(() => restore(confirmation, true)) }, t('replace')),
              h('button', { type: 'button', style: buttonStyle, disabled: pending, onClick: () => setConfirmation(null) }, t('keepDraft'))),
            message && h('div', { role: 'status', style: { fontSize: 12, marginTop: 8 } }, message));
        }
        function ImageParameters({ details, image, pending = false, missing = false }) {
          const attachment = image?.attachment;
          const actual = attachment?.width && attachment?.height ? `${attachment.width}x${attachment.height}` : details.size;
          const value = item => item || t(pending && !missing ? 'configured' : 'unknown');
          return h('div', { style: { display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '8px 0' } },
            h('span', null, `${t('model')}：${value(details.model)}`),
            h('span', null, `${t('quality')}：${value(details.quality)}`),
            h('span', null, `${t(pending ? 'actualSize' : 'outputSize')}：${value(pending ? details.requestedSize : actual)}`),
            !pending && actual && details.requestedSize && actual !== details.requestedSize && h('span', { role: 'status' }, `${t('sizeMismatch')} (${details.requestedSize})`));
        }
        function ImageCard(props) {
          useCopy();
          const state = props.node.data;
          // Select the published snapshot, not a newly allocated array: selector
          // hooks require referentially stable values between notifications.
          const snapshot = props.useConversation(s => s.views.get('chat'));
          const [compare, setCompare] = React.useState(false);
          const [selectedKey, setSelectedKey] = React.useState('');
          const versions = history.versions(snapshot);
          const own = versions.find(version => version.callId === state.callId);
          const others = versions.filter(version => version.callId !== state.callId);
          const details = history.info(state.block, state.meta, state.args, state.request);
          const parent = others.findLast(version => version.seq < state.seq && details.referenceIds.includes(version.image.attachment.attachmentId));
          const previous = others.findLast(version => version.seq < state.seq);
          const selected = others.find(version => version.key === selectedKey) ?? parent ?? previous ?? others[0];
          const label = version => `${t('version')} ${versions.indexOf(version) + 1}`;
          const pending = state.status === 'running';
          const succeeded = state.status === 'succeeded';
          const status = pending ? state.operation === 'edit' ? 'editing' : 'generating'
            : succeeded ? 'completed' : state.status === 'failed' ? 'generationFailed' : state.status;
          const images = history.images(state.block);
          const imageView = (image, info, caption) => h('div', { style: { flex: '1 1 260px', minWidth: 0, maxWidth: '100%' } },
            h('strong', { style: { fontSize: 12 } }, caption),
            h(ImageParameters, { details: info, image }),
            h(EditableImages, { ...props, images: [image], align: 'left', compact: false, thumbnail: false }));
          return h('section', { 'aria-label': t('once'), 'aria-busy': pending, style: { margin: '12px 0', padding: 14, border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 14, maxWidth: '100%', boxSizing: 'border-box' } },
            h('div', { role: state.status === 'failed' ? 'alert' : 'status', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              h('strong', null, t(status)), own && h('span', { style: { fontSize: 12 } }, label(own)),
              parent && h('span', { style: { fontSize: 12 } }, `${t('basedOn')}：${label(parent)}`)),
            !succeeded && h(ImageParameters, { details, pending: true, missing: !pending }),
            pending && h('div', { style: { padding: '28px 12px', borderRadius: 8, background: 'var(--dsw-alias-button-floating-fill)', fontSize: 13 } }, t('waitingImage')),
            !pending && !succeeded && h('div', { style: { fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 8 } }, state.status === 'failed' && details.text, state.status === 'failed' && details.text && '\n', t('noRetry')),
            !pending && !succeeded && props.inputActions && h(RecoveryActions, { ...props, state }),
            succeeded && h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 } },
              images.map((image, index) => h('div', { key: image.attachment.attachmentId, style: { flex: '1 1 260px', minWidth: 0 } }, imageView(image, details, `${t('currentVersion')}${images.length > 1 ? ` ${index + 1}` : ''}`))),
              compare && selected && imageView(selected.image, selected, label(selected))),
            succeeded && h('div', { style: { marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
              h('button', { type: 'button', style: buttonStyle, 'aria-expanded': compare, onClick: () => setCompare(!compare) }, t(compare ? 'closeCompare' : 'compare')),
              compare && others.length > 0 && h('label', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0, maxWidth: '100%' } }, t('compareWith'), ' ',
                h('select', { 'aria-label': t('compareWith'), value: selected?.key ?? '', onChange: event => setSelectedKey(event.target.value), style: { ...buttonStyle, maxWidth: '100%' } },
                  others.map(version => h('option', { key: version.key, value: version.key }, `${label(version)} · ${version.model || t('unknown')} · ${version.size || t('unknown')}`))))),
            succeeded && compare && h('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 0 } }, others.length ? t('historyHint') : t('noVersions')));
        }
        for (const key of ['openai_generate_image', 'openai_edit_image']) {
          ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
            name: 'tool.call.toolview', key,
          }, ImageToolResult));
        }
        ctx.uiConversation.events.register(history.definition);
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
          name: 'conversation.chat.node', key: history.kind,
        }, ImageCard));
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'openai-image-draw', order: 30 }, DrawButton));
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'openai-image-updates', order: 20 }, UpdatePanel));
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
