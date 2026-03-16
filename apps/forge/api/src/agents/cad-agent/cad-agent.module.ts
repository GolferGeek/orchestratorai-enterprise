import { Module } from '@nestjs/common';
import { CadAgentController } from './cad-agent.controller';
import { CadAgentService } from './cad-agent.service';
import { CadDbService } from './services/cad-db.service';
import { CadStorageService } from './services/cad-storage.service';
import { OpenCascadeExecutorService } from './services/opencascade-executor.service';
import { SharedServicesModule } from '../shared/services/shared-services.module';
import { PersistenceModule } from '../shared/persistence/persistence.module';

/**
 * CadAgentModule
 *
 * Provides the CAD Agent for generating 3D CAD models from natural language.
 * The agent:
 * - Generates OpenCascade.js code from user prompts
 * - Validates the generated code
 * - Executes code using OpenCASCADE.js WASM to produce geometry
 * - Exports to multiple formats (STEP, STL, GLTF, DXF)
 * - Stores drawings and outputs in Supabase Storage
 * - Records output metadata in the database
 */
@Module({
  imports: [SharedServicesModule, PersistenceModule],
  controllers: [CadAgentController],
  providers: [
    CadAgentService,
    CadDbService,
    CadStorageService,
    OpenCascadeExecutorService,
  ],
  exports: [CadAgentService, OpenCascadeExecutorService],
})
export class CadAgentModule {}
