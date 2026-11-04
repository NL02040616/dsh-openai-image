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
      },
      en: {
        'gpt-image-2.5-flare': 'Speed first: suited to everyday creation and quick iterations. Supports reference-image editing and subject preservation.',
        'gpt-image-2.5-sunburst': 'Quality first: suited to complex scenes, demanding detail, and precise edits. Supports reference-image editing and subject preservation.',
        'gpt-image-1-mini': 'Budget option: a cost-efficient GPT Image 1 variant for generation and editing. Only low input fidelity is supported. Officially deprecated.',
        usage: 'Upload images and describe the changes, or continue editing the latest image. Start with /new to create a fresh image.',
      },
    };
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('openai-image', descriptions));
        const t = ctx.locale.bind('openai-image');
        const subscribe = listener => ctx.locale.subscribe(listener);
        const getSnapshot = () => ctx.locale.getSnapshot();
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
