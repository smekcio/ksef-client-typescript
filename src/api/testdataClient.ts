import { BaseClient } from "../client/baseClient";
import {
  TestDataContextBlockRequest,
  TestDataContextBlockResponse,
  TestDataContextUnblockRequest,
  TestDataContextUnblockResponse,
  TestdataRequest,
  TestdataResponse,
  TestDataUpdateCertificateRequest,
} from "../types/testdata";
import { requireCertificateSerialNumber } from "../utils/certificateSerial";

export class TestdataClient extends BaseClient {
  async enableAttachments(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/attachment", request);
  }

  async revokeAttachments(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/attachment/revoke", request);
  }

  async grantPermissions(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/permissions", request);
  }

  async revokePermissions(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/permissions/revoke", request);
  }

  async blockContext(request: TestDataContextBlockRequest): Promise<TestDataContextBlockResponse> {
    return this.post("/testdata/context/block", request);
  }

  async unblockContext(
    request: TestDataContextUnblockRequest,
  ): Promise<TestDataContextUnblockResponse> {
    return this.post("/testdata/context/unblock", request);
  }

  async createPerson(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/person", request);
  }

  async removePerson(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/person/remove", request);
  }

  async createSubject(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/subject", request);
  }

  async removeSubject(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/subject/remove", request);
  }

  async updateCertificate(
    serialNumber: string,
    request: TestDataUpdateCertificateRequest,
  ): Promise<void> {
    const validated = requireCertificateSerialNumber(serialNumber);
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "PUT",
      path: `/testdata/certificates/${encodeURIComponent(validated)}`,
      body: request,
      authToken: token,
    });
  }

  private async post<TResponse = TestdataResponse>(path: string, body: object): Promise<TResponse> {
    const token = await this.getAccessToken();
    return this.http.request<TResponse>({
      method: "POST",
      path,
      body,
      authToken: token,
    });
  }
}
