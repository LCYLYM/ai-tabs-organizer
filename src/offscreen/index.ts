import { classifyWithChromeBuiltIn } from '../shared/chrome-built-in-provider.js';
import type {
  OffscreenClassificationRequest,
  OffscreenClassificationResponse
} from '../shared/types.js';
import { serializeError } from '../shared/utils.js';

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'offscreen-classify') {
    return undefined;
  }

  const request = message as OffscreenClassificationRequest;

  void (async () => {
    try {
      const decision = await classifyWithChromeBuiltIn(request.payload, request.config);
      const response: OffscreenClassificationResponse = {
        type: 'offscreen-classify-result',
        requestId: request.requestId,
        ok: true,
        decision
      };
      sendResponse(response);
    } catch (error) {
      const response: OffscreenClassificationResponse = {
        type: 'offscreen-classify-result',
        requestId: request.requestId,
        ok: false,
        error: serializeError(error)
      };
      sendResponse(response);
    }
  })();

  return true;
});
