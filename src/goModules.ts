import { getBinPath, getToolsEnvVars, getGoVersion } from './util';
import path = require('path');
import cp = require('child_process');
import vscode = require('vscode');
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { installTools } from './goInstallTools';

function containsModFile(folderPath: string): Promise<boolean> {
	let goExecutable = getBinPath('go');
	if (!goExecutable) {
		return Promise.reject(new Error('Cannot find "go" binary. Update PATH or GOROOT appropriately.'));
	}
	return new Promise(resolve => {
		cp.execFile(goExecutable, ['env', 'GOMOD'], { cwd: folderPath }, (err, stdout) => {
			if (err) {
				console.warn(`Error when running go env GOMOD: ${err}`);
				return resolve(false);
			}
			let [goMod] = stdout.split('\n');
			resolve(!!goMod);
		});
	});
}
const workspaceModCache = new Map<string, boolean>();
const packageModCache = new Map<string, string>();

export function isModSupported(fileuri: vscode.Uri): Promise<boolean> {
	return getGoVersion().then(value => {
		if (value && (value.major !== 1 || value.minor < 11)) {
			return false;
		}

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileuri);
		if (workspaceFolder && workspaceModCache.get(workspaceFolder.uri.fsPath)) {
			return true;
		}
		const pkgPath = path.dirname(fileuri.fsPath);
		if (packageModCache.get(pkgPath)) {
			return true;
		}
		return containsModFile(pkgPath).then(result => {
			workspaceModCache.set(pkgPath, result);
			return result;
		});
	});
}

export function updateWorkspaceModCache() {
	if (!vscode.workspace.workspaceFolders) {
		return;
	}
	vscode.workspace.workspaceFolders.forEach(folder => {
		containsModFile(folder.uri.fragment).then(result => {
			workspaceModCache.set(folder.uri.fsPath, result);
		});
	});
}

const promptedToolsForCurrentSession = new Set<string>();
export function promptToUpdateToolForModules(tool: string) {
	if (promptedToolsForCurrentSession.has(tool)) {
		return;
	}
	const promptedToolsForModules = getFromGlobalState('promptedToolsForModules', {});
	if (promptedToolsForModules[tool]) {
		return;
	}
	vscode.window.showInformationMessage(
		`To auto-complete unimported packages when using Go modules, please update your version of the "${tool}" tool.`,
		'Update',
		'Later',
		`Don't show again`)
		.then(selected => {
			switch (selected) {
				case 'Update':
					installTools([tool]);
					promptedToolsForModules[tool] = true;
					updateGlobalState('promptedToolsForModules', promptedToolsForModules);
					break;
				case `Don't show again`:
					promptedToolsForModules[tool] = true;
					updateGlobalState('promptedToolsForModules', promptedToolsForModules);
					break;
				case 'Later':
				default:
					promptedToolsForCurrentSession.add(tool);
					break;
			}
		});
}
