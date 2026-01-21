import fs from "fs/promises";
import { ViberPaths } from "../config";

export interface Dataset {
  id: string;
  name: string;
  type: string;
  icon: string;
  description: string;
  items: number;
  lastUpdated: string;
  size: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  lastModified: string;
}

export type { Document as KnowledgeDocument };

export interface DocumentsMap {
  [key: string]: Document[];
}

export class Knowledge {
  private static configDir = ViberPaths.getPath('datasets');
  private static datasetsPath = ViberPaths.getPath('datasets') + "/datasets.json";
  private static documentsPath = ViberPaths.getPath('datasets') + "/documents.json";

  static async loadDatasets(): Promise<Dataset[]> {
    try {
      const data = await fs.readFile(Knowledge.datasetsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static async loadDocuments(): Promise<DocumentsMap> {
    try {
      const data = await fs.readFile(Knowledge.documentsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  static async saveDatasets(datasets: Dataset[]): Promise<void> {
    await fs.mkdir(Knowledge.configDir, { recursive: true });
    await fs.writeFile(Knowledge.datasetsPath, JSON.stringify(datasets, null, 2));
  }

  static async saveDocuments(documents: DocumentsMap): Promise<void> {
    await fs.mkdir(Knowledge.configDir, { recursive: true });
    await fs.writeFile(Knowledge.documentsPath, JSON.stringify(documents, null, 2));
  }

  static async addDataset(dataset: Dataset): Promise<void> {
    const datasets = await Knowledge.loadDatasets();
    datasets.push(dataset);
    await Knowledge.saveDatasets(datasets);
  }

  static async updateDataset(id: string, updates: Partial<Dataset>): Promise<void> {
    const datasets = await Knowledge.loadDatasets();
    const index = datasets.findIndex(d => d.id === id);
    if (index !== -1) {
      datasets[index] = { ...datasets[index], ...updates };
      await Knowledge.saveDatasets(datasets);
    }
  }

  static async deleteDataset(id: string): Promise<void> {
    const datasets = await Knowledge.loadDatasets();
    const filtered = datasets.filter(d => d.id !== id);
    await Knowledge.saveDatasets(filtered);

    // Also remove associated documents
    const documents = await Knowledge.loadDocuments();
    delete documents[id];
    await Knowledge.saveDocuments(documents);
  }

  static async addDocument(datasetId: string, document: Document): Promise<void> {
    const documents = await Knowledge.loadDocuments();
    if (!documents[datasetId]) {
      documents[datasetId] = [];
    }
    documents[datasetId].push(document);
    await Knowledge.saveDocuments(documents);
  }

  static async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    const documents = await Knowledge.loadDocuments();
    if (documents[datasetId]) {
      documents[datasetId] = documents[datasetId].filter(d => d.id !== documentId);
      await Knowledge.saveDocuments(documents);
    }
  }
}