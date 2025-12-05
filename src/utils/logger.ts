import chalk from 'chalk';

export enum LogLevel {
    QUIET = 0,
    DEBUG = 1,
    VERBOSE = 2
}

class Logger {
    private level: LogLevel;

    constructor() {
        this.level = this.parseLevel(process.env.LOG_LEVEL);
    }

    private parseLevel(level?: string): LogLevel {
        switch (level?.toUpperCase()) {
            case 'QUIET':
                return LogLevel.QUIET;
            case 'VERBOSE':
                return LogLevel.VERBOSE;
            case 'DEBUG':
            default:
                return LogLevel.DEBUG;
        }
    }

    public getLevel(): LogLevel {
        return this.level;
    }

    public chat(role: string, message: string) {
        // Chat is always logged unless specifically suppressed, but requirement says QUIET has Assistant/User
        // so this is the base level.
        const color = role.toLowerCase() === 'user' ? chalk.green : chalk.cyan;
        console.log(`${color.bold(role + ':')} ${message}`);
    }

    public info(message: string, ...args: any[]) {
        if (this.level >= LogLevel.DEBUG) {
            console.log(chalk.blue('ℹ ') + message, ...args);
        }
    }

    public success(message: string, ...args: any[]) {
        if (this.level >= LogLevel.DEBUG) {
            console.log(chalk.green('✔ ') + message, ...args);
        }
    }

    public warn(message: string, ...args: any[]) {
        if (this.level >= LogLevel.DEBUG) {
            console.log(chalk.yellow('⚠ ') + message, ...args);
        }
    }

    public error(message: string, ...args: any[]) {
        console.error(chalk.red('✖ ') + message, ...args);
    }

    public debug(message: string, ...args: any[]) {
        if (this.level >= LogLevel.DEBUG) {
            console.log(chalk.gray('DEBUG: ') + message, ...args);
        }
    }

    public verbose(message: string, ...args: any[]) {
        if (this.level >= LogLevel.VERBOSE) {
            console.log(chalk.gray('VERBOSE: ') + message, ...args);
        }
    }

    public logMemory(type: string, content: any) {
        if (this.level >= LogLevel.VERBOSE) {
            console.log(chalk.magenta.bold(`\n[${type} Memory]`));
            if (typeof content === 'string') {
                console.log(chalk.dim(content));
            } else {
                const replacer = (key: string, value: any) => {
                    if (key === 'embedding' && Array.isArray(value)) {
                        if (value.length > 5) {
                            return [...value.slice(0, 5), `... (${value.length - 5} more)`];
                        }
                    }
                    return value;
                };
                console.log(chalk.dim(JSON.stringify(content, replacer, 2)));
            }
        }
    }

    public logPrompt(name: string, content: string) {
        if (this.level >= LogLevel.VERBOSE) {
            console.log(chalk.yellow.bold(`\n--- Rendered Prompt: ${name} ---`));
            console.log(chalk.dim(content));
            console.log(chalk.yellow.bold('------------------------------\n'));
        }
    }
}

export const logger = new Logger();

