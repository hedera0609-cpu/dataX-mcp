/**
 * DNS スタック（Phase 2）
 * Route53 ワイルドカードレコードと ACM 証明書を管理する
 * ACM 証明書は us-east-1 に作成する（ALB用ワイルドカード証明書の要件）
 */

import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface DnsStackProps extends cdk.StackProps {
  // 管理するドメイン（例: sandbox.yourcompany.com）
  domain: string;
  alb: elbv2.ApplicationLoadBalancer;
}

export class DnsStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const { domain, alb } = props;

    // =====================================
    // Route53 ホストゾーン（既存ゾーンを参照）
    // 事前にAWSコンソールでホストゾーンを作成しておくこと
    // =====================================

    this.hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domain,
    });

    // =====================================
    // ACM ワイルドカード証明書
    // *.sandbox.yourcompany.com をカバーする
    // DNS検証を使用する（自動更新に対応）
    // =====================================

    this.certificate = new acm.Certificate(this, "WildcardCertificate", {
      // ワイルドカード証明書でサブドメインを全てカバーする
      domainName: `*.${domain}`,
      // DNS検証でRoute53に自動的にCNAMEレコードを追加する
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // =====================================
    // Route53 ワイルドカード Aレコード
    // *.datax.yourcompany.com → ALB
    // =====================================

    new route53.ARecord(this, "WildcardARecord", {
      zone: this.hostedZone,
      // ワイルドカードレコードでサブドメインを全てALBにルーティングする
      recordName: `*.${domain}`,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb)
      ),
      ttl: cdk.Duration.minutes(5),
      comment: "DataX: ワイルドカードレコード（全サブドメイン→ALB）",
    });

    // =====================================
    // CFn 出力
    // =====================================

    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      exportName: "DataXCertificateArn",
      description: "ACM wildcard certificate ARN (set in ECS stack)",
    });

    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
      exportName: "DataXHostedZoneId",
    });
  }
}
