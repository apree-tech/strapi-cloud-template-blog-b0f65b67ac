import type { Schema, Struct } from '@strapi/strapi';

export interface ReportComponentsAnalysisBlock extends Struct.ComponentSchema {
  collectionName: 'components_report_components_analysis_blocks';
  info: {
    displayName: 'analysis-block';
  };
  attributes: {
    chart_data: Schema.Attribute.JSON;
    chart_type: Schema.Attribute.Enumeration<
      ['line', 'bar', 'pie', 'scatter', 'none']
    > &
      Schema.Attribute.Required;
    conclusions: Schema.Attribute.Blocks;
    content: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface ReportComponentsChartBlock extends Struct.ComponentSchema {
  collectionName: 'components_report_components_chart_blocks';
  info: {
    displayName: 'chart-block';
  };
  attributes: {
    chart_type: Schema.Attribute.Enumeration<
      ['line', 'bar', 'pie', 'doughnut', 'radar', 'scatter']
    >;
    config: Schema.Attribute.JSON;
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    data: Schema.Attribute.JSON;
    title: Schema.Attribute.String;
  };
}

export interface ReportComponentsCommentBlock extends Struct.ComponentSchema {
  collectionName: 'components_report_components_comment_blocks';
  info: {
    description: 'Chat-like comments with @mention support';
    displayName: 'Comment Block';
  };
  attributes: {
    messages: Schema.Attribute.JSON &
      Schema.Attribute.CustomField<'plugin::collaborative-editing.chat-comments'> &
      Schema.Attribute.DefaultTo<[]>;
  };
}

export interface ReportComponentsImageItem extends Struct.ComponentSchema {
  collectionName: 'components_report_components_image_items';
  info: {
    displayName: 'image-item';
  };
  attributes: {
    alt_text: Schema.Attribute.String;
    caption: Schema.Attribute.String;
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    display_order: Schema.Attribute.Integer;
    image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'> &
      Schema.Attribute.Required;
  };
}

export interface ReportComponentsImageSection extends Struct.ComponentSchema {
  collectionName: 'components_report_components_image_sections';
  info: {
    displayName: 'image-section';
  };
  attributes: {
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    images: Schema.Attribute.Component<'report-components.image-item', true>;
    section_title: Schema.Attribute.String & Schema.Attribute.Required;
    section_type: Schema.Attribute.Enumeration<
      ['capture', 'content', 'analysis', 'gallery']
    > &
      Schema.Attribute.Required;
  };
}

export interface ReportComponentsMetricGroup extends Struct.ComponentSchema {
  collectionName: 'components_report_components_metric_groups';
  info: {
    displayName: 'metric-group';
  };
  attributes: {
    metrics: Schema.Attribute.Component<'report-components.metric-item', true>;
    section_title: Schema.Attribute.String & Schema.Attribute.Required;
    section_type: Schema.Attribute.Enumeration<
      ['general', 'advanced', 'comparison', 'custom']
    > &
      Schema.Attribute.Required;
  };
}

export interface ReportComponentsMetricItem extends Struct.ComponentSchema {
  collectionName: 'components_report_components_metric_items';
  info: {
    displayName: 'metric-item';
  };
  attributes: {
    display_order: Schema.Attribute.Integer;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    unit: Schema.Attribute.String;
    value: Schema.Attribute.String & Schema.Attribute.Required;
    value_number: Schema.Attribute.Integer;
  };
}

export interface ReportComponentsSection extends Struct.ComponentSchema {
  collectionName: 'components_report_components_sections';
  info: {
    displayName: 'section';
  };
  attributes: {
    description: Schema.Attribute.Blocks;
    title: Schema.Attribute.String;
  };
}

export interface ReportComponentsSocialMediaStats
  extends Struct.ComponentSchema {
  collectionName: 'components_report_components_social_media_stats';
  info: {
    description: '\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0441\u043E\u0446\u0441\u0435\u0442\u0435\u0439 \u0441 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u043C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439';
    displayName: 'social-media-stats';
  };
  attributes: {
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    metrics: Schema.Attribute.JSON &
      Schema.Attribute.CustomField<'plugin::collaborative-editing.social-metrics'>;
  };
}

export interface ReportComponentsSocialMetric extends Struct.ComponentSchema {
  collectionName: 'components_report_components_social_metrics';
  info: {
    description: '\u041C\u0435\u0442\u0440\u0438\u043A\u0430 \u0441\u043E\u0446\u0441\u0435\u0442\u0438 \u0441 \u043F\u0440\u043E\u0448\u043B\u044B\u043C \u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u043C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435\u043C';
    displayName: 'Social Metric';
  };
  attributes: {
    change_indicator: Schema.Attribute.String;
    change_percent: Schema.Attribute.Decimal;
    current_value: Schema.Attribute.BigInteger & Schema.Attribute.DefaultTo<0>;
    metric_name: Schema.Attribute.String & Schema.Attribute.Required;
    prev_value: Schema.Attribute.BigInteger & Schema.Attribute.DefaultTo<0>;
  };
}

export interface ReportComponentsTableData extends Struct.ComponentSchema {
  collectionName: 'components_report_components_table_data';
  info: {
    description: '\u0422\u0430\u0431\u043B\u0438\u0446\u0430 \u0441 \u043D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u043C\u044B\u043C\u0438 \u043A\u043E\u043B\u043E\u043D\u043A\u0430\u043C\u0438 \u0438 \u0441\u0442\u0440\u043E\u043A\u0430\u043C\u0438';
    displayName: 'table-data';
  };
  attributes: {
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    headers: Schema.Attribute.JSON;
    rows: Schema.Attribute.JSON;
    tableContent: Schema.Attribute.JSON &
      Schema.Attribute.CustomField<'plugin::collaborative-editing.table-editor'>;
    title: Schema.Attribute.String;
    totals: Schema.Attribute.JSON;
  };
}

export interface ReportComponentsTextBlock extends Struct.ComponentSchema {
  collectionName: 'components_report_components_text_blocks';
  info: {
    displayName: 'text-block';
  };
  attributes: {
    content: Schema.Attribute.Blocks;
    contentWidth: Schema.Attribute.Enumeration<['w25', 'w50', 'w75', 'w100']> &
      Schema.Attribute.DefaultTo<'w100'>;
    style: Schema.Attribute.Enumeration<
      ['default', 'highlighted', 'quote', 'warning']
    >;
    title: Schema.Attribute.String;
  };
}

export interface SharedMedia extends Struct.ComponentSchema {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedRichText extends Struct.ComponentSchema {
  collectionName: 'components_shared_rich_texts';
  info: {
    description: '';
    displayName: 'Rich text';
    icon: 'align-justify';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Struct.ComponentSchema {
  collectionName: 'components_shared_sliders';
  info: {
    description: '';
    displayName: 'Slider';
    icon: 'address-book';
  };
  attributes: {
    files: Schema.Attribute.Media<'images', true>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'report-components.analysis-block': ReportComponentsAnalysisBlock;
      'report-components.chart-block': ReportComponentsChartBlock;
      'report-components.comment-block': ReportComponentsCommentBlock;
      'report-components.image-item': ReportComponentsImageItem;
      'report-components.image-section': ReportComponentsImageSection;
      'report-components.metric-group': ReportComponentsMetricGroup;
      'report-components.metric-item': ReportComponentsMetricItem;
      'report-components.section': ReportComponentsSection;
      'report-components.social-media-stats': ReportComponentsSocialMediaStats;
      'report-components.social-metric': ReportComponentsSocialMetric;
      'report-components.table-data': ReportComponentsTableData;
      'report-components.text-block': ReportComponentsTextBlock;
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
    }
  }
}
