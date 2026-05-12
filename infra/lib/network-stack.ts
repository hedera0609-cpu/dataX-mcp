/**
 * ネットワークスタック
 * VPC、セキュリティグループ、IP制限を管理する
 * 許可IPはすべて環境変数から取得する（ハードコーディング禁止）
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface NetworkStackProps extends cdk.StackProps {
  // 許可するオフィス固定IP（CIDR形式: xxx.xxx.xxx.xxx/32）
  allowedOfficeIp: string;
  // 許可するVPN固定IP（CIDR形式: xxx.xxx.xxx.xxx/32）
  allowedVpnIp: string;
}

export class NetworkStack extends cdk.Stack {
  // 他のスタックから参照できるようにプロパティとして公開する
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // IPアドレスのバリデーション（空文字やプレースホルダーを拒否）
    if (
      !props.allowedOfficeIp ||
      props.allowedOfficeIp.includes("xxx") ||
      !props.allowedVpnIp ||
      props.allowedVpnIp.includes("xxx")
    ) {
      throw new Error(
        "ALLOWED_OFFICE_IP と ALLOWED_VPN_IP を環境変数に設定してください。" +
          "例: ALLOWED_OFFICE_IP=203.0.113.1/32"
      );
    }

    // =====================================
    // VPC の作成
    // =====================================

    this.vpc = new ec2.Vpc(this, "DataXVpc", {
      vpcName: "datax-vpc",
      maxAzs: 2,
      // パブリックサブネット（ALB用）とプライベートサブネット（ECS用）
      subnetConfiguration: [
        {
          name: "datax-public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "datax-private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      // ECRからのイメージPullのためNATゲートウェイが必要
      natGateways: 1,
    });

    // =====================================
    // ALB セキュリティグループ
    // オフィスIPとVPN IPのみHTTPS(443)を許可する
    // =====================================

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "datax-alb-sg",
      description: "DataX ALB: Allow HTTPS from office IP and VPN IP only",
      allowAllOutbound: true,
    });

    // Allow HTTPS from office IP
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowedOfficeIp),
      ec2.Port.tcp(443),
      "Allow HTTPS from office IP"
    );

    // Allow HTTPS from VPN IP
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowedVpnIp),
      ec2.Port.tcp(443),
      "Allow HTTPS from VPN IP"
    );

    // Allow HTTP for redirect (office IP)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowedOfficeIp),
      ec2.Port.tcp(80),
      "Allow HTTP redirect from office IP"
    );

    // Allow HTTP for redirect (VPN IP)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowedVpnIp),
      ec2.Port.tcp(80),
      "Allow HTTP redirect from VPN IP"
    );

    // =====================================
    // ECS セキュリティグループ
    // ALBセキュリティグループからのトラフィックのみ許可する
    // ECSへの直接アクセスを完全に遮断する
    // =====================================

    this.ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: "datax-ecs-sg",
      description: "DataX ECS: Allow traffic from ALB only (direct access blocked)",
      allowAllOutbound: true,
    });

    // Allow port 8080 from ALB security group only
    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(8080),
      "Allow traffic from ALB only"
    );

    // =====================================
    // CFn 出力（他スタックや運用での参照用）
    // =====================================

    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      exportName: "DataXVpcId",
    });

    new cdk.CfnOutput(this, "AlbSecurityGroupId", {
      value: this.albSecurityGroup.securityGroupId,
      exportName: "DataXAlbSecurityGroupId",
    });

    new cdk.CfnOutput(this, "EcsSecurityGroupId", {
      value: this.ecsSecurityGroup.securityGroupId,
      exportName: "DataXEcsSecurityGroupId",
    });

    new cdk.CfnOutput(this, "PrivateSubnets", {
      value: this.vpc.privateSubnets.map((s) => s.subnetId).join(","),
      exportName: "DataXPrivateSubnets",
    });
  }
}
