/**
 * ECS スタック
 * ECSクラスター、ALB、IAMロールを作成する
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { NetworkStack } from "./network-stack.js";

export interface EcsStackProps extends cdk.StackProps {
  networkStack: NetworkStack;
  sourceBucket: s3.Bucket;
  appsTable: dynamodb.Table;
  // ACM証明書ARN（Phase 2で必要、Phase 1はオプション）
  certificateArn?: string;
}

export class EcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly taskExecutionRole: iam.Role;
  public readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const { vpc, albSecurityGroup, ecsSecurityGroup } = props.networkStack;

    // =====================================
    // ECS クラスター
    // =====================================

    this.cluster = new ecs.Cluster(this, "DataXCluster", {
      clusterName: "datax-cluster",
      vpc,
      // Container Insightsでメトリクスを収集する
      containerInsights: true,
    });

    // =====================================
    // ALB（アプリケーションロードバランサー）
    // パブリックサブネットに配置してインターネットからアクセス可能にする
    // =====================================

    this.alb = new elbv2.ApplicationLoadBalancer(this, "DataXAlb", {
      loadBalancerName: "datax-alb",
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      // パブリックサブネットに配置する
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTP→HTTPSリダイレクトリスナー
    this.alb.addListener("HttpRedirectListener", {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    // HTTPSリスナー（ACM証明書が指定された場合のみ）
    if (props.certificateArn) {
      // Phase 2: ACM証明書を使用してHTTPSを有効化する
      const cert = elbv2.ListenerCertificate.fromArn(props.certificateArn);
      this.httpsListener = this.alb.addListener("HttpsListener", {
        port: 443,
        certificates: [cert],
        // デフォルトレスポンス（マッチするルールがない場合）
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: "text/plain",
          messageBody: "DataX: App not found",
        }),
        sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      });
    } else {
      // Phase 1: HTTPSなしでHTTPのみ（暫定）
      this.httpsListener = this.alb.addListener("HttpListener", {
        port: 8080,
        defaultAction: elbv2.ListenerAction.fixedResponse(404, {
          contentType: "text/plain",
          messageBody: "DataX: App not found",
        }),
      });
    }

    // =====================================
    // IAM: タスク実行ロール
    // ECSがECRからイメージPullするために必要
    // =====================================

    this.taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      roleName: "datax-task-execution-role",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // CloudWatch Logsへの書き込み権限を追加する
    this.taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );

    // =====================================
    // IAM: タスクロール
    // アプリコンテナがAWSサービスにアクセスするために必要
    // =====================================

    this.taskRole = new iam.Role(this, "TaskRole", {
      roleName: "datax-task-role",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // S3バケットへの読み書き権限（アプリがS3を使う場合）
    props.sourceBucket.grantReadWrite(this.taskRole);

    // DynamoDBテーブルへの読み書き権限（SandboxDB SDKが使用）
    props.appsTable.grantReadWriteData(this.taskRole);

    // =====================================
    // ALBアクセスログ用S3バケット
    // =====================================

    const accessLogsBucket = new s3.Bucket(this, "AlbAccessLogsBucket", {
      bucketName: `datax-alb-logs-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        // アクセスログは90日で自動削除する
        { expiration: cdk.Duration.days(90) },
      ],
    });

    // ALBのアクセスログを有効化する
    this.alb.logAccessLogs(accessLogsBucket, "alb-logs");

    // =====================================
    // CFn 出力
    // =====================================

    new cdk.CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      exportName: "DataXClusterName",
    });

    new cdk.CfnOutput(this, "AlbDnsName", {
      value: this.alb.loadBalancerDnsName,
      exportName: "DataXAlbDnsName",
    });

    new cdk.CfnOutput(this, "AlbArn", {
      value: this.alb.loadBalancerArn,
      exportName: "DataXAlbArn",
    });

    new cdk.CfnOutput(this, "HttpsListenerArn", {
      value: this.httpsListener.listenerArn,
      exportName: "DataXHttpsListenerArn",
    });

    new cdk.CfnOutput(this, "TaskExecutionRoleArn", {
      value: this.taskExecutionRole.roleArn,
      exportName: "DataXTaskExecutionRoleArn",
    });

    new cdk.CfnOutput(this, "TaskRoleArn", {
      value: this.taskRole.roleArn,
      exportName: "DataXTaskRoleArn",
    });
  }
}
