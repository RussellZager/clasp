import {expect} from 'chai';
import esmock from 'esmock';
import sinon from 'sinon';
import type {AuthInfo} from '../../src/auth/auth.js';

describe('MCP Server', () => {
  let buildMcpServer: any;
  let mockInitClaspInstance: sinon.SinonStub;
  let mockClasp: any;
  let mockMcpServerClass: any;
  let mockServerInstance: any;
  let tools: {[key: string]: Function} = {};

  const mockAuth: AuthInfo = {
    credentials: {} as any,
    token: {} as any,
    isLocalCreds: true,
  };

  before(async () => {
    const mockFs = {
      mkdir: sinon.stub().resolves(),
    };

    mockInitClaspInstance = sinon.stub();

    mockServerInstance = {
      tool: sinon.stub().callsFake((name, description, schema, hints, handler) => {
        tools[name] = handler;
      }),
      connect: sinon.stub(),
    };

    mockMcpServerClass = sinon.stub().returns(mockServerInstance);

    const module = await esmock('../../src/mcp/server.js', {
      '../../src/core/clasp.js': {
        initClaspInstance: mockInitClaspInstance,
      },
      'fs/promises': mockFs,
      '@modelcontextprotocol/sdk/server/mcp.js': {
        McpServer: mockMcpServerClass,
      },
      // Mocking getVersion to avoid reading package.json
      '../../src/commands/program.js': {
        getVersion: () => '1.0.0',
      },
    });
    buildMcpServer = module.buildMcpServer;
  });

  beforeEach(() => {
    mockClasp = {
      project: {
        scriptId: 'mock-script-id',
        createScript: sinon.stub().resolves('new-script-id'),
        updateSettings: sinon.stub().resolves(),
        listScripts: sinon.stub().resolves({results: [{id: 's1', name: 'Script 1'}]}),
      },
      files: {
        push: sinon.stub().resolves([{localPath: 'code.js'}]),
        pull: sinon.stub().resolves([{localPath: 'code.js'}]),
      },
      withContentDir: sinon.stub().returnsThis(),
      withScriptId: sinon.stub().returnsThis(),
    };
    mockInitClaspInstance.resetHistory();
    mockInitClaspInstance.resolves(mockClasp);
    tools = {}; // Reset tools
  });

  it('should build an MCP server and register tools', () => {
    buildMcpServer(mockAuth);
    expect(mockMcpServerClass.called).to.be.true;
    expect(Object.keys(tools)).to.include.members([
      'push_files',
      'pull_files',
      'create_project',
      'clone_project',
      'list_projects',
    ]);
  });

  describe('push_files', () => {
    it('should push files successfully', async () => {
      buildMcpServer(mockAuth);
      const handler = tools['push_files'];
      const result = await handler({projectDir: '/tmp/project'});

      expect(mockInitClaspInstance.calledWithMatch({rootDir: '/tmp/project'})).to.be.true;
      expect(mockClasp.files.push.called).to.be.true;
      expect(result.status).to.equal('success');
      expect(result.content[0].text).to.include('Pushed project');
    });

    it('should return error if projectDir is missing', async () => {
      buildMcpServer(mockAuth);
      const handler = tools['push_files'];
      const result = await handler({});

      expect(result.isError).to.be.true;
      expect(result.content[0].text).to.include('Project directory is required');
    });

    it('should handle errors during push', async () => {
        buildMcpServer(mockAuth);
        mockClasp.files.push.rejects(new Error('Push failed'));
        const handler = tools['push_files'];
        const result = await handler({projectDir: '/tmp/project'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Error pushing project: Push failed');
    });
  });

  describe('pull_files', () => {
    it('should pull files successfully', async () => {
      buildMcpServer(mockAuth);
      const handler = tools['pull_files'];
      const result = await handler({projectDir: '/tmp/project'});

      expect(mockInitClaspInstance.calledWithMatch({rootDir: '/tmp/project'})).to.be.true;
      expect(mockClasp.files.pull.called).to.be.true;
      expect(result.content[0].text).to.include('Pulled project');
    });

    it('should return error if projectDir is missing', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['pull_files'];
        const result = await handler({});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Project directory is required');
    });

    it('should handle errors during pull', async () => {
        buildMcpServer(mockAuth);
        mockClasp.files.pull.rejects(new Error('Pull failed'));
        const handler = tools['pull_files'];
        const result = await handler({projectDir: '/tmp/project'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Error pulling project: Pull failed');
    });
  });

  describe('create_project', () => {
      it('should create project successfully', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['create_project'];
        const result = await handler({projectDir: '/tmp/project', projectName: 'My Project'});

        expect(mockInitClaspInstance.calledWithMatch({rootDir: '/tmp/project'})).to.be.true;
        expect(mockClasp.project.createScript.calledWith('My Project')).to.be.true;
        expect(mockClasp.files.pull.called).to.be.true;
        expect(mockClasp.project.updateSettings.called).to.be.true;
        expect(result.content[0].text).to.include('Created project');
      });

      it('should infer project name if not provided', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['create_project'];
        await handler({projectDir: '/tmp/project'});

        // getNameFromPath logic uses inflection.humanize, so 'project' -> 'Project'
        expect(mockClasp.project.createScript.calledWith('Project')).to.be.true;
      });

      it('should return error if projectDir is missing', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['create_project'];
        const result = await handler({});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Project directory is required');
      });

      it('should handle errors', async () => {
        buildMcpServer(mockAuth);
        mockClasp.project.createScript.rejects(new Error('Create failed'));
        const handler = tools['create_project'];
        const result = await handler({projectDir: '/tmp/project'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Error creating project: Create failed');
      });
  });

  describe('clone_project', () => {
    it('should clone project successfully', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['clone_project'];
        const result = await handler({projectDir: '/tmp/project', scriptId: 'some-id'});

        expect(mockInitClaspInstance.calledWithMatch({rootDir: '/tmp/project'})).to.be.true;
        expect(mockClasp.withScriptId.calledWith('some-id')).to.be.true;
        expect(mockClasp.files.pull.called).to.be.true;
        expect(mockClasp.project.updateSettings.called).to.be.true;
        expect(result.content[0].text).to.include('Cloned project');
    });

    it('should return error if projectDir is missing', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['clone_project'];
        const result = await handler({scriptId: 'some-id'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Project directory is required');
    });

    it('should return error if scriptId is missing', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['clone_project'];
        const result = await handler({projectDir: '/tmp/project'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Script ID is required');
    });

    it('should handle errors', async () => {
        buildMcpServer(mockAuth);
        mockClasp.files.pull.rejects(new Error('Clone failed'));
        const handler = tools['clone_project'];
        const result = await handler({projectDir: '/tmp/project', scriptId: 'some-id'});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Error cloning project: Clone failed');
    });
  });

  describe('list_projects', () => {
      it('should list projects successfully', async () => {
        buildMcpServer(mockAuth);
        const handler = tools['list_projects'];
        const result = await handler({});

        expect(mockInitClaspInstance.called).to.be.true;
        expect(mockClasp.project.listScripts.called).to.be.true;
        expect(result.content[0].text).to.include('Found 1 Apps Script projects');
      });

      it('should handle errors', async () => {
        buildMcpServer(mockAuth);
        mockClasp.project.listScripts.rejects(new Error('List failed'));
        const handler = tools['list_projects'];
        const result = await handler({});

        expect(result.isError).to.be.true;
        expect(result.content[0].text).to.include('Error listing projects: List failed');
      });
  });

});
