export declare function defaultVariableTemplatePath(): string | null;
export declare function resolveVariableTemplatePath(): string;
/**
 * Build merged variable-template SVG bytes. Does not write `square_variable_template.svg`.
 */
export declare function mergeFilledIconIntoVariableTemplate(iconSvgXml: string, opts?: {
    templatePath?: string;
}): Buffer;
