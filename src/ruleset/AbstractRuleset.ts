/**
 * AbstractRuleset.ts
 *
 * @copyright Vitalii Savchuk <esvit666@gmail.com>
 * @package einvoicing
 * @licence MIT https://opensource.org/licenses/MIT
 */
import Document from '../entity/Document';

export interface IValidationResult {
  errors: { key: string; message: string }[];
  warning: { key: string; message: string }[];
}

export interface IRule {
  type: 'error' | 'warning';
  test: (document: Document) => boolean;
  message: string;
}

export default abstract class AbstractRuleset {
  abstract getCustomizationID(): string;

  abstract get rules(): { [key: string]: IRule };

  validate(document: Document): IValidationResult {
    const res: IValidationResult = {
      errors: [],
      warning: [],
    };
    for (const key in this.rules) {
      if (!this.rules[key].test(document)) {
        res.errors.push({ key, message: this.rules[key].message });
      }
    }
    return res;
  }
}
