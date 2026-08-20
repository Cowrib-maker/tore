export const OPEN_LEGAL_AI_WIDGET_EVENT = "tore:open-legal-ai-widget";

export type OpenLegalAiWidgetDetail = {
  /** When present, the widget opens and immediately sends this message. */
  message?: string;
};

export function dispatchOpenLegalAiWidget(detail?: OpenLegalAiWidgetDetail) {
  window.dispatchEvent(
    new CustomEvent<OpenLegalAiWidgetDetail>(OPEN_LEGAL_AI_WIDGET_EVENT, {
      detail,
    }),
  );
}
