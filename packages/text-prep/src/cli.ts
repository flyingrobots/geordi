#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJsonPort } from '@flyingrobots/geordi-core';
import {
  formatTextPrepDiagnostics,
  prepareTextPrepArtifacts,
  TEXT_PREP_GENERATION_PLAN_FILENAME,
  type TextPrepDiagnostic,
} from './index.js';

export interface TextPrepCliOutput {
  write(content: string): void;
}

export interface TextPrepCliIo {
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  stderr: TextPrepCliOutput;
  stdout: TextPrepCliOutput;
  writeFile(path: string, content: string): Promise<void>;
}

interface TextPrepCliOptions {
  readonly inputPath: string;
  readonly outputDirectory: string;
}

interface TextPrepCliOptionsFailure {
  readonly diagnostics: readonly TextPrepDiagnostic[];
  readonly ok: false;
}

interface TextPrepCliOptionsSuccess {
  readonly options: TextPrepCliOptions;
  readonly ok: true;
}

type TextPrepCliOptionsResult = TextPrepCliOptionsFailure | TextPrepCliOptionsSuccess;

const defaultIo: TextPrepCliIo = {
  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  },
  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  },
  stderr: {
    write(content: string): void {
      process.stderr.write(content);
    },
  },
  stdout: {
    write(content: string): void {
      process.stdout.write(content);
    },
  },
  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, 'utf8');
  },
};

export async function runTextPrepCli(
  argv: readonly string[] = process.argv.slice(2),
  io: TextPrepCliIo = defaultIo,
): Promise<number> {
  const command = argv.length === 0 ? '--help' : argv[0];
  if (command === '--help' || command === '-h') {
    io.stdout.write(usage());
    return 0;
  }

  if (command !== 'prepare') {
    io.stderr.write(
      formatTextPrepDiagnostics([
        diagnostic(
          'GEORDI_TEXT_PREP_BAD_INPUT',
          '$.command',
          `Unsupported text-prep command: ${command}.`,
        ),
      ]),
    );
    return 1;
  }

  const options = parsePrepareOptions(argv.slice(1));
  if (!options.ok) {
    io.stderr.write(formatTextPrepDiagnostics(options.diagnostics));
    return 1;
  }

  let source: string;
  try {
    source = await io.readFile(options.options.inputPath);
  } catch {
    io.stderr.write(
      formatTextPrepDiagnostics([
        diagnostic(
          'GEORDI_TEXT_PREP_IO_ERROR',
          '$.args.input',
          `Unable to read text-prep input: ${options.options.inputPath}.`,
        ),
      ]),
    );
    return 1;
  }

  const result = prepareTextPrepArtifacts(source);
  if (!result.ok) {
    io.stderr.write(formatTextPrepDiagnostics(result.diagnostics));
    return 1;
  }

  const planPath = join(options.options.outputDirectory, TEXT_PREP_GENERATION_PLAN_FILENAME);
  const strictTextFixturePath =
    result.serializedStrictTextFixture === undefined || result.strictTextFixtureFile === undefined
      ? undefined
      : join(options.options.outputDirectory, result.strictTextFixtureFile);
  try {
    await io.mkdir(options.options.outputDirectory);
    await io.writeFile(planPath, result.serializedPlan);
    if (result.serializedStrictTextFixture !== undefined && strictTextFixturePath !== undefined) {
      await io.writeFile(strictTextFixturePath, result.serializedStrictTextFixture);
    }
  } catch {
    io.stderr.write(
      formatTextPrepDiagnostics([
        diagnostic(
          'GEORDI_TEXT_PREP_IO_ERROR',
          '$.args.output',
          `Unable to write text-prep artifacts under: ${options.options.outputDirectory}.`,
        ),
      ]),
    );
    return 1;
  }

  io.stdout.write(
    `${canonicalJsonPort.stringify(
      {
        ok: true,
        planPath,
        strictTextFixturePath,
      },
      { space: 2 },
    )}\n`,
  );

  return 0;
}

function parsePrepareOptions(argv: readonly string[]): TextPrepCliOptionsResult {
  let inputPath: string | undefined;
  let outputDirectory: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--input') {
      inputPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === '--output') {
      outputDirectory = argv[index + 1];
      index += 1;
      continue;
    }

    return {
      diagnostics: [
        diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', '$.args', `Unsupported CLI argument: ${item}.`),
      ],
      ok: false,
    };
  }

  const diagnostics: TextPrepDiagnostic[] = [];
  if (inputPath === undefined || inputPath.length === 0) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', '$.args.input', 'Missing --input path.'),
    );
  }
  if (outputDirectory === undefined || outputDirectory.length === 0) {
    diagnostics.push(
      diagnostic('GEORDI_TEXT_PREP_BAD_INPUT', '$.args.output', 'Missing --output directory.'),
    );
  }

  if (diagnostics.length > 0 || inputPath === undefined || outputDirectory === undefined) {
    return {
      diagnostics,
      ok: false,
    };
  }

  return {
    ok: true,
    options: {
      inputPath,
      outputDirectory,
    },
  };
}

function usage(): string {
  return [
    'Usage:',
    '  geordi-text-prep prepare --input <text-prep.input.geordi.json> --output <directory>',
    '',
    'The first slice validates pinned strict text-prep inputs and writes a deterministic generation plan.',
    '',
  ].join('\n');
}

function diagnostic(
  code: TextPrepDiagnostic['code'],
  path: string,
  message: string,
): TextPrepDiagnostic {
  return {
    code,
    message,
    path,
  };
}

if (process.argv.length > 1 && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runTextPrepCli();
}
