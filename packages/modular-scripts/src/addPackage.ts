import * as fs from 'fs-extra';
import * as path from 'path';
import {
  pascalCase as toPascalCase,
  paramCase as toParamCase,
} from 'change-case';
import prompts from 'prompts';
import getModularRoot from './getModularRoot';
import execSync from './execSync';

const packagesRoot = 'packages';

// recursively get all files in a folder
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    const pathToCheck = path.join(dirPath, file);
    if (fs.statSync(pathToCheck).isDirectory()) {
      arrayOfFiles = getAllFiles(pathToCheck, arrayOfFiles);
    } else {
      arrayOfFiles.push(pathToCheck);
    }
  });

  return arrayOfFiles;
}

export default async function addPackage(
  destination: string,
  typeArg: string | void,
  nameArg: string | void,
): Promise<void> {
  const { type, name } =
    (typeArg && nameArg ? { type: typeArg, name: nameArg } : null) ||
    ((await prompts([
      {
        name: 'name',
        type: 'text',
        message: `What would you like to name this package?`,
        initial: toParamCase(destination),
      },
      {
        name: 'type',
        type: 'select',
        message: `What kind of package is this?`,
        choices: [
          { title: 'A plain package', value: 'package' },
          { title: 'A view within an application', value: 'view' },
          { title: 'A standalone application', value: 'app' },
        ],
        initial: 0,
      },
    ])) as { type: string; name: string });

  const modularRoot = getModularRoot();
  const newComponentName = toPascalCase(name);

  const newPackagePath = path.join(modularRoot, packagesRoot, destination);
  const packageTypePath = path.join(__dirname, '../types', type);

  // create a new package source folder
  if (fs.existsSync(newPackagePath)) {
    console.error(`A package already exists at ${destination}!`);
    process.exit(1);
  }

  fs.mkdirpSync(newPackagePath);
  fs.copySync(packageTypePath, newPackagePath);

  const packageFilePaths = getAllFiles(newPackagePath);

  for (const packageFilePath of packageFilePaths) {
    fs.writeFileSync(
      packageFilePath,
      fs
        .readFileSync(packageFilePath, 'utf8')
        .replace(/PackageName__/g, name)
        .replace(/ComponentName__/g, newComponentName),
    );
    if (path.basename(packageFilePath) === 'packagejson') {
      // we've named package.json as packagejson in these templates
      fs.moveSync(
        packageFilePath,
        packageFilePath.replace('packagejson', 'package.json'),
      );
    }
  }

  if (type === 'app') {
    // add a tsconfig, because CRA expects it
    await fs.writeJSON(
      path.join(newPackagePath, 'tsconfig.json'),
      {
        extends: path.relative(newPackagePath, modularRoot) + '/tsconfig.json',
      },
      { spaces: 2 },
    );
  }

  execSync('yarnpkg', [], { cwd: newPackagePath });
  execSync('yarnpkg', [], { cwd: modularRoot });
}