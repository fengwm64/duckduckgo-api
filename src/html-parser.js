/**
 * HTML解析器 - 为CloudFlare Workers提供简易的HTML解析功能
 */

export class DOMParser {
  parseFromString(html, mimeType) {
    return new HTMLDocument(html);
  }
}

class HTMLDocument {
  constructor(html) {
    this.html = html;
    this.body = new HTMLElement('body', this);
    this.body.textContent = this.extractText(html);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    // 简化的选择器实现，仅支持类选择器
    const elements = [];
    let classMatch;
    
    if (selector.startsWith('.') && (classMatch = this.html.match(new RegExp(`<[^>]*class="[^"]*${selector.substring(1)}[^"]*"[^>]*>`, 'g')))) {
      for (const match of classMatch) {
        elements.push(new HTMLElement(match, this));
      }
    }
    
    return elements;
  }

  extractText(html) {
    // 移除HTML标签，简化提取文本内容
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

class HTMLElement {
  constructor(html, document) {
    this.html = html;
    this.document = document;
    this._textContent = null;
  }

  querySelector(selector) {
    // 简单选择器实现
    return null;
  }

  querySelectorAll(selector) {
    // 简单选择器实现
    return [];
  }

  getAttribute(name) {
    const regex = new RegExp(`${name}=["']([^"']*)["']`);
    const match = this.html.match(regex);
    return match ? match[1] : null;
  }

  get textContent() {
    if (!this._textContent) {
      // 简单文本提取
      const withoutTags = this.html.replace(/<[^>]+>/g, ' ');
      this._textContent = withoutTags.replace(/\s+/g, ' ').trim();
    }
    return this._textContent;
  }

  remove() {
    // 假实现，因为这是简化的解析器
  }
}
