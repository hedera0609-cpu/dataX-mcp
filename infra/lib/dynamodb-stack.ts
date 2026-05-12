/**
 * DynamoDB スタック
 * アプリ状態管理テーブルとS3バケットを作成する
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class DynamoDbStack extends cdk.Stack {
  public readonly appsTable: dynamodb.Table;
  public readonly sourceBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =====================================
    // DynamoDB テーブル: datax-apps
    // PK: USER#{nickname} / SK: APP#{app-name}
    // =====================================

    this.appsTable = new dynamodb.Table(this, "DataXAppsTable", {
      tableName: "datax-apps",
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // 削除保護を有効化する（誤削除防止）
      deletionProtection: true,
      // ポイントインタイムリカバリを有効化する
      pointInTimeRecovery: true,
      // テーブル削除時のデータ保持設定
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // =====================================
    // S3 バケット: datax-app-sources
    // アプリのソースファイルを保管する
    // =====================================

    this.sourceBucket = new s3.Bucket(this, "DataXSourceBucket", {
      bucketName: `datax-app-sources-${this.account}-${this.region}`,
      // パブリックアクセスを完全ブロックする
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // サーバーサイド暗号化を有効化する
      encryption: s3.BucketEncryption.S3_MANAGED,
      // バージョニングを有効化する（誤上書き防止）
      versioned: true,
      // バケット削除時のデータ保持設定
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // HTTPS のみアクセスを許可する
      enforceSSL: true,
      // 古いバージョンのライフサイクルポリシー（ストレージコスト削減）
      lifecycleRules: [
        {
          // 30日以上経過した旧バージョンを削除する
          noncurrentVersionExpiration: cdk.Duration.days(30),
          // 削除マーカーも自動削除する
          expiredObjectDeleteMarker: true,
        },
      ],
    });

    // =====================================
    // CFn 出力
    // =====================================

    new cdk.CfnOutput(this, "AppsTableName", {
      value: this.appsTable.tableName,
      exportName: "DataXAppsTableName",
    });

    new cdk.CfnOutput(this, "SourceBucketName", {
      value: this.sourceBucket.bucketName,
      exportName: "DataXSourceBucketName",
    });
  }
}
