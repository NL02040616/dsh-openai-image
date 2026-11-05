window.__ModuleLoader__.load({
  id: '@local/dsh-openai-image',
  factory(require) {
    const React = require('react');
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
      },
    };
    return {
      inject: ['slots', 'locale', 'conversation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('openai-image', descriptions));
        const t = ctx.locale.bind('openai-image');
        const subscribe = listener => ctx.locale.subscribe(listener);
        const getSnapshot = () => ctx.locale.getSnapshot();
        const h = React.createElement;
        const active = draft => /^\/image(?:\s|$)/.test(draft);
        const editable = input => input && !['adjudicating', 'submitting'].includes(input.phase);
        const buttonStyle = { font: 'inherit', fontSize: 12, borderRadius: 16, padding: '5px 10px', cursor: 'pointer', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-button-floating-fill)', border: '1px solid var(--dsw-alias-border-l3)' };
        function useCopy() { React.useSyncExternalStore(subscribe, getSnapshot); return t; }
        function arm(input, inputActions) {
          if (!editable(input)) throw new Error(t('unavailable'));
          if (/^\//.test(input.draft) && !active(input.draft)) throw new Error(t('otherCommand'));
          if (!active(input.draft)) inputActions.setDraft({ text: `/image ${input.draft}`, references: input.occurrences.map(ref => ({ ...ref, offset: ref.offset + 7 })), command: { token: '/image' } });
        }
        function cancel(input, inputActions) {
          const removed = input.draft.match(/^\/image(?:\s|$)/)?.[0].length ?? 0;
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
        function ReferenceDock({ useInput, useSession, inputActions }) {
          useCopy();
          const input = useInput(s => s);
          const running = useSession(s => s.running);
          if (!input || !active(input.draft)) return null;
          const images = ctx.conversation.resolveDraftAttachments(input.attachmentIds).filter(item => item.kind === 'image');
          const removeReferences = () => {
            for (const image of images) { inputActions.removeAttachment(image.id); ctx.conversation.releaseDraftAttachment(image.id); }
          };
          return h('div', { role: 'region', 'aria-label': t('once'), style: { marginTop: 8, padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 12, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('strong', null, images.length ? t('references', { count: images.length }) : t('newImage')),
              images.length > 0 && h('button', { type: 'button', style: buttonStyle, disabled: running || !editable(input), onClick: removeReferences }, t('clear')),
              h('button', { type: 'button', style: buttonStyle, disabled: !editable(input), onClick: () => cancel(input, inputActions) }, t('cancel'))),
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
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'openai-image-references', order: 30 }, ReferenceDock));
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
          name: 'conversation.input.model.label', id: 'openai-image-capabilities', order: 5,
        }, ImageModelLabel));
      },
    };
  },
});
