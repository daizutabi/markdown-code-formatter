import * as cp from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';

const fencedCodeRegExp = new RegExp(/^(`{3,}|~{3,})(.+?\r?\n)([^]+?)^(\1)$/, 'mu');

function getLanguage(text: string): string {
	const language = text.trim();
	if (language.startsWith('{')) {
		for (const x of language.slice(1, language.length - 1).split(' ')) {
			if (x.startsWith('.')) {
				return x.slice(1);
			}
		}
		return '';
	}
	return language.split(' ')[0];
}

function split(text: string): [string[], string[]] {
	const source = text;
	let index = 0;
	let end = 0;
	const languages: string[] = [];
	const sources: string[] = [];
	while (true) {
		const result = fencedCodeRegExp.exec(text.slice(index));
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

async function formatBlock(uri: vscode.Uri, text: string, language: string): Promise<string> {
	if (language === '') {
		return text;
	}
	const data = Buffer.from(text, 'utf8');
	await vscode.workspace.fs.writeFile(uri, data);
	const path = uri.fsPath;
	if (language === 'python') {
		await execute(['isort', 'black'], path);
	}
	const formatted = await vscode.workspace.fs.readFile(uri);
	vscode.workspace.fs.delete(uri);
	return Buffer.from(formatted).toString('utf8');
}

async function format() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const document = editor.document;
	const intentionalInvalidRange = new vscode.Range(0, 0, document.lineCount, 0);
	const range = document.validateRange(intentionalInvalidRange);
	let text = document.getText(range);
	const splitted = split(text);
	const languages = splitted[0];
	const sources = splitted[1];

	const base = document.uri;
	const promises: Promise<string>[] = [];
	languages.forEach((language, index) => {
		const uri = base.with({ path: base.path + '~' + index.toString() });
		promises.push(formatBlock(uri, sources[index], language));
	});
	text = (await Promise.all(promises)).join('');
	editor.edit(editBuilder => {
		editBuilder.replace(range, text);
	});
}


export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('markdown-code-formatter.formatCode', format);
	context.subscriptions.push(disposable);
}