export class ErrorLLMProvider {
    statusCode;
    constructor(statusCode) {
        this.statusCode = statusCode;
    }
    async generate(_request, _signal) {
        const error = new Error(`Provider returned HTTP ${this.statusCode}`);
        error.status = this.statusCode;
        throw error;
    }
}
