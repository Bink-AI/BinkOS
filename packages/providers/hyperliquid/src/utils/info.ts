import { RateLimiter } from './rateLimiter';
import { GeneralInfoAPI } from './general';
import { SpotInfoAPI } from './spot';
import { PerpetualsInfoAPI } from './perpetuals';
import { HttpApi } from './helper';
import { SymbolConversion } from './symbolConversion';

import {
  AllMids,
  Meta,
  UserOpenOrders,
  FrontendOpenOrders,
  UserFills,
  UserRateLimit,
  OrderStatus,
  L2Book,
  CandleSnapshot,
} from './types';

import { InfoType, ENDPOINTS } from './constants';
import { Hyperliquid } from '../hyperliquid';

export class InfoAPI {
  public spot: SpotInfoAPI;
  public perpetuals: PerpetualsInfoAPI;
  private httpApi: HttpApi;
  private generalAPI: GeneralInfoAPI;
  private symbolConversion: SymbolConversion;
  private parent: Hyperliquid;

  constructor(
    baseURL: string,
    rateLimiter: RateLimiter,
    symbolConversion: SymbolConversion,
    parent: Hyperliquid,
  ) {
    this.httpApi = new HttpApi(baseURL, ENDPOINTS.INFO, rateLimiter);
    this.symbolConversion = symbolConversion;
    this.parent = parent;

    this.generalAPI = new GeneralInfoAPI(this.httpApi, this.symbolConversion, this.parent);
    this.spot = new SpotInfoAPI(this.httpApi, this.symbolConversion);
    this.perpetuals = new PerpetualsInfoAPI(this.httpApi, this.symbolConversion);
  }

  async getAssetIndex(assetName: string): Promise<number | undefined> {
    return await this.symbolConversion.getAssetIndex(assetName);
  }

  async getInternalName(exchangeName: string): Promise<string | undefined> {
    return await this.symbolConversion.convertSymbol(exchangeName);
  }

  async getAllAssets(): Promise<{ perp: string[]; spot: string[] }> {
    return await this.symbolConversion.getAllAssets();
  }

  async getAllMids(rawResponse: boolean = false): Promise<AllMids> {
    return this.generalAPI.getAllMids(rawResponse);
  }

  async getUserOpenOrders(user: string, rawResponse: boolean = false): Promise<UserOpenOrders> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getUserOpenOrders(user, rawResponse);
  }

  async getFrontendOpenOrders(
    user: string,
    rawResponse: boolean = false,
  ): Promise<FrontendOpenOrders> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getFrontendOpenOrders(user, rawResponse);
  }

  async getUserFills(user: string, rawResponse: boolean = false): Promise<UserFills> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getUserFills(user, rawResponse);
  }

  async getUserFillsByTime(
    user: string,
    startTime: number,
    endTime: number,
    rawResponse: boolean = false,
  ): Promise<UserFills> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getUserFillsByTime(user, startTime, endTime, rawResponse);
  }

  async getUserRateLimit(user: string, rawResponse: boolean = false): Promise<UserRateLimit> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getUserRateLimit(user, rawResponse);
  }

  async getOrderStatus(
    user: string,
    oid: number | string,
    rawResponse: boolean = false,
  ): Promise<OrderStatus> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getOrderStatus(user, oid, rawResponse);
  }

  async getL2Book(coin: string, rawResponse: boolean = false): Promise<L2Book> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getL2Book(coin, rawResponse);
  }

  async getCandleSnapshot(
    coin: string,
    interval: string,
    startTime: number,
    endTime: number,
    rawResponse: boolean = false,
  ): Promise<CandleSnapshot> {
    await this.parent.ensureInitialized();
    return this.generalAPI.getCandleSnapshot(coin, interval, startTime, endTime, rawResponse);
  }
}
