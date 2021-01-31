import * as cp from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';

const codeRegexp = new RegExp(/^(`{3,}|~{3,})(.+?\r?\n)([^]+?)^(\1)$/, 'mu');

function getLanguage(text: string): string {
	let langauge = text.trim();
	if (langauge.startsWith('{')) {
		for (const x of langauge.slice(1, langauge.length - 1).split(' ')) {
			if (x.startsWith('.')) {
				return x.slice(1);
			}
		}
		return '';
	}
	return langauge.split(' ')[0];
}

function split(text: string): [string[], string[]] {
	const source = text;
	let index = 0;
	let end = 0;
	const languages: string[] = [];
	const sources: string[] = [];
	while (true) {
		const result = codeRegexp.exec(text.slice(index));
		if (result === null) {
			break;
		}
		end = index + result.index + result[1].length + result[2].length;
		if (index !== result.index) {
			languages.push('');
			sources.push(source.slice(index, end));
		}
		languages.push(getLanguage(result[2]));
		sources.push(result[3]);
		index = end + result[3].length;
	}
	if (source.length > index) {
		languages.push('');
		sources.push(source.slice(index));
	}
	if (sources.join('') !== source) {
		console.log('Split error.');
	}
	return [languages, sources];
}

const execFile = util.promisify(cp.execFile);

async function execute(commands: string[], path: string) {
	for (const command of commands) {
		await execFile(command, [path]).catch((err: any) => {
			console.log('=====' + command + '=====');
			console.log(err);
		});
	}
}

async function format(uri: vscode.Uri, text: string, langauge: string): Promise<string> {
	const data = Buffer.from(text, 'utf8');
	await vscode.workspace.fs.writeFile(uri, data);
	const path = uri.fsPath;
	if (langauge === 'python') {
		await execute(['isort', 'black'], path);
	}
	const formatted = await vscode.workspace.fs.readFile(uri);
	return Buffer.from(formatted).toString('utf8');
}

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('markdown-code-formatter.formatCode', async function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}
		const document = editor.document;
		const invalidRange = new vscode.Range(0, 0, document.lineCount, 0);
		const fullRange = document.validateRange(invalidRange);
		const text = document.getText(fullRange);
		const splitted = split(text);
		const languages = splitted[0];
		const sources = splitted[1];

		const base = document.uri;
		languages.forEach((lang, index) => {
			console.log(lang, index.toString());
		});
		// const uri = base.with({ path: base.path + '~' });
		// text = await format(uri, text, 'python');
		// console.log(text);

		editor.edit(editBuilder => {
			editBuilder.replace(fullRange, text);
		});
	});

	context.subscriptions.push(disposable);
}