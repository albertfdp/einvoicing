/**
 * UblWriter.ts
 *
 * @copyright Vitalii Savchuk <esvit666@gmail.com>
 * @package einvoicing
 * @licence MIT https://opensource.org/licenses/MIT
 */
import AbstractWriter from './AbstractWriter';
import Document from '../entity/Document';
import { XMLBuilder } from 'fast-xml-parser';
import { computeTotals, formatNumber, omitEmpty } from '../helpers';
import AllowanceCharge from '../valueObject/AllowanceCharge';
import CurrencyCode from '../valueObject/CurrencyCode';
import Address from '../valueObject/Address';

export default class UblWriter extends AbstractWriter {
  write(document: Document): string {
    const builder = new XMLBuilder({
      attributeNamePrefix: 'attr_',
      ignoreAttributes: false,
      format: false,
      suppressEmptyNode: true,
    });

    const xmlNamespaces = Object.keys(document.xmlNamespaces || {}).reduce(
      (acc, ns) => ({ ...acc, [`attr_${ns}`]: document.xmlNamespaces[ns] }),
      {},
    );

    const { linesTotal, taxInclusiveAmount, taxExclusiveAmount, chargesTotal } =
      computeTotals(document);

    const json = {
      '?xml': { attr_version: '1.0', attr_encoding: 'UTF-8' },
      Invoice: {
        ...xmlNamespaces,
        'cbc:CustomizationID':
          'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
        'cbc:ProfileID': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
        'cbc:ID': document.id.toPrimitive(),
        'cbc:IssueDate': document.issueDate?.toPrimitive(),
        'cbc:DueDate': document.dueDate?.toPrimitive(),
        'cbc:InvoiceTypeCode': document.type?.toPrimitive(),
        'cbc:Note': document.notes,
        'cbc:DocumentCurrencyCode': document.currency?.toPrimitive(),
        'cbc:AccountingCost': document.buyerAccountingReference,
        'cbc:BuyerReference': document.buyerReference,
        'cbc:TaxPointDate': document.taxPointDate?.toPrimitive(),
        'cac:InvoicePeriod': {
          'cbc:StartDate': document.periodStart?.toPrimitive(),
          'cbc:EndDate': document.periodEnd?.toPrimitive(),
        },
        'cac:OrderReference': {
          'cbc:ID': document.purchaseOrderReference?.toPrimitive(),
        },
        'cac:BillingReference': document.precedingInvoiceReference?.map(
          (reference) => ({
            'cac:InvoiceDocumentReference': {
              'cbc:ID': reference.id,
              'cbc:IssueDate': reference.issueDate?.toPrimitive(),
            },
          }),
        ),
        'cac:OriginatorDocumentReference': {
          'cbc:ID': document.originatorDocumentReference?.toPrimitive(),
        },
        'cac:ContractDocumentReference': {
          'cbc:ID': document.contractReference?.toPrimitive(),
        },
        'cac:AdditionalDocumentReference': document.attachments?.map(
          (attachment) => ({
            'cbc:ID': attachment.id.toPrimitive(),
            'cbc:DocumentTypeCode': attachment.documentTypeCode,
            'cbc:DocumentDescription': attachment.description,
            'cac:Attachment': attachment.content
              ? {
                  'cbc:EmbeddedDocumentBinaryObject': {
                    '#text': btoa(attachment.content.content),
                    attr_mimeCode: attachment.content.mimeCode,
                    attr_filename: attachment.content.filename,
                  },
                }
              : attachment.externalUri
                ? {
                    'cac:ExternalReference': {
                      'cbc:URI': attachment.externalUri,
                    },
                  }
                : undefined,
          }),
        ),
        'cac:AccountingSupplierParty': {
          'cac:Party': {
            'cbc:EndpointID': document.seller?.endpointId?.toPrimitive(),
            'cac:PartyIdentification':
              document.seller?.additionalIdentifiers?.map((id) => ({
                'cbc:ID': id.toPrimitive(),
              })),
            'cac:PartyName': {
              'cbc:Name': document.seller?.tradingName,
            },
            'cac:PostalAddress': this.addressToXmlNode(
              document.seller?.address,
            ),
            'cac:PartyTaxScheme': document.seller?.taxRegistration?.map(
              (taxRegistration) => ({
                'cbc:CompanyID': taxRegistration?.id.toPrimitive(),
                'cac:TaxScheme': {
                  'cbc:ID': taxRegistration?.scheme,
                },
              }),
            ),
            'cac:PartyLegalEntity': {
              'cbc:RegistrationName': document.seller?.legalName,
              'cbc:CompanyID': document.seller?.companyId?.toPrimitive(),
              'cbc:CompanyLegalForm': document.seller?.companyLegalForm,
            },
            'cac:Contact': {
              'cbc:Name': document.seller?.contact?.name,
              'cbc:Telephone': document.seller?.contact?.phone,
              'cbc:ElectronicMail': document.seller?.contact?.email,
            },
          },
        },
        'cac:AccountingCustomerParty': {
          'cac:Party': {
            'cbc:EndpointID': document.buyer?.endpointId?.toPrimitive(),
            'cac:PartyIdentification':
              document.buyer?.additionalIdentifiers?.map((id) => ({
                'cbc:ID': id.toPrimitive(),
              })),
            'cac:PartyName': {
              'cbc:Name': document.buyer?.tradingName,
            },
            'cac:PostalAddress': this.addressToXmlNode(document.buyer?.address),
            'cac:PartyTaxScheme': document.buyer?.taxRegistration?.map(
              (taxRegistration) => ({
                'cbc:CompanyID': taxRegistration?.id.toPrimitive(),
                'cac:TaxScheme': {
                  'cbc:ID': taxRegistration?.scheme,
                },
              }),
            ),
            'cac:PartyLegalEntity': {
              'cbc:RegistrationName': document.buyer?.legalName,
              'cbc:CompanyID': document.buyer?.companyId?.toPrimitive(),
              'cbc:CompanyLegalForm': document.buyer?.companyLegalForm,
            },
            'cac:Contact': {
              'cbc:Name': document.buyer?.contact?.name,
              'cbc:Telephone': document.buyer?.contact?.phone,
              'cbc:ElectronicMail': document.buyer?.contact?.email,
            },
          },
        },
        'cac:Delivery': {
          'cbc:ActualDeliveryDate': document.delivery?.date?.toPrimitive(),
          'cac:DeliveryLocation': {
            'cbc:ID': document.delivery?.locationId?.toPrimitive(),
            'cac:Address': this.addressToXmlNode(document.delivery?.address),
          },
          'cac:DeliveryParty': {
            'cac:PartyName': {
              'cbc:Name': document.delivery?.name,
            },
          },
        },
        'cac:PaymentMeans': {
          'cbc:PaymentMeansCode': {
            attr_name: document.payment?.meansName,
            '#text': document.payment?.meansCode,
          },
          'cbc:PaymentID': document.payment?.id,
          'cac:PayeeFinancialAccount': {
            'cbc:ID': document.payment?.transfer?.account,
            'cbc:Name': document.payment?.transfer?.name,
            'cac:FinancialInstitutionBranch': {
              'cbc:ID': document.payment?.transfer?.provider?.toPrimitive(),
            },
          },
        },
        'cac:PaymentTerms': {
          'cbc:Note': document.payment?.terms,
        },
        'cac:AllowanceCharge': document.charges?.map((charge) =>
          this.allowanceChargeToXmlNode(charge, document.currency),
        ),
        'cac:TaxTotal': {
          'cbc:TaxAmount': {
            '#text': formatNumber(
              document.taxes?.reduce(
                (sum, tax) => sum + (tax.taxAmount || 0),
                0,
              ),
            ),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cac:TaxSubtotal': document.taxes?.map((tax) => ({
            'cbc:TaxableAmount': {
              '#text': formatNumber(tax.taxableAmount),
              attr_currencyID: tax.currency?.toPrimitive(),
            },
            'cbc:TaxAmount': {
              '#text': formatNumber(tax.taxAmount),
              attr_currencyID: tax.currency?.toPrimitive(),
            },
            'cac:TaxCategory': {
              'cbc:ID': tax.id.toPrimitive().split(':')[0],
              'cbc:Percent': formatNumber(tax.percent),
              'cbc:TaxExemptionReason': tax.taxExemptionReason,
              'cbc:TaxExemptionReasonCode': tax.taxExemptionReasonCode,
              'cac:TaxScheme': {
                'cbc:ID': 'VAT',
              },
            },
          })),
        },
        'cac:LegalMonetaryTotal': {
          'cbc:LineExtensionAmount': {
            '#text': formatNumber(linesTotal),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cbc:TaxExclusiveAmount': {
            '#text': formatNumber(taxExclusiveAmount),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cbc:TaxInclusiveAmount': {
            '#text': formatNumber(taxInclusiveAmount),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cbc:ChargeTotalAmount': {
            '#text': formatNumber(chargesTotal),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cbc:PayableAmount': {
            '#text': formatNumber(taxInclusiveAmount),
            attr_currencyID: document.currency?.toPrimitive(),
          },
        },
        'cac:InvoiceLine': document.lines?.map((line) => ({
          'cbc:ID': line.id.toPrimitive(),
          'cbc:InvoicedQuantity': {
            '#text': formatNumber(line.quantity),
            attr_unitCode: line.unitCode,
          },
          'cbc:LineExtensionAmount': {
            '#text': formatNumber(line.netAmount),
            attr_currencyID: document.currency?.toPrimitive(),
          },
          'cbc:AccountingCost': line.buyerAccountingReference,
          'cac:InvoicePeriod': {
            'cbc:StartDate': line.periodStart?.toPrimitive(),
            'cbc:EndDate': line.periodEnd?.toPrimitive(),
          },
          'cac:OrderLineReference': {
            'cbc:LineID': line.orderLineReference?.toPrimitive(),
          },
          'cbc:Note': line.note,
          'cac:AllowanceCharge': line.charges?.map((charge) =>
            this.allowanceChargeToXmlNode(charge, document.currency),
          ),
          'cac:Item': {
            'cbc:Description': line.description,
            'cbc:Name': line.name,
            'cac:SellersItemIdentification': {
              'cbc:ID': line.sellerIdentifier?.toPrimitive(),
            },
            'cac:StandardItemIdentification': {
              'cbc:ID': line.standardIdentifier?.toPrimitive(),
            },
            'cac:OriginCountry': {
              'cbc:IdentificationCode': line.originCountryCode,
            },
            'cac:CommodityClassification': line.classificationIdentifiers?.map(
              (identifier) => ({
                'cbc:ItemClassificationCode': identifier.toPrimitive(),
              }),
            ),
            'cac:ClassifiedTaxCategory': {
              'cbc:ID': line.tax?.id.toPrimitive().split(':')[0],
              'cbc:Percent': formatNumber(line.tax?.percent),
              'cac:TaxScheme': {
                'cbc:ID': 'VAT',
              },
            },
          },
          'cac:Price': {
            'cbc:PriceAmount': {
              '#text': formatNumber(line.price),
              attr_currencyID: document.currency?.toPrimitive(),
            },
          },
        })),
      },
    };

    return builder.build(omitEmpty(json));
  }

  addressToXmlNode(address: Address) {
    return {
      'cbc:StreetName': address?.streetName,
      'cbc:AdditionalStreetName': address?.addressLines?.[1],
      'cbc:CityName': address?.cityName,
      'cbc:PostalZone': address?.postalZone,
      'cbc:CountrySubentity': address?.subdivision,
      'cac:Country': {
        'cbc:IdentificationCode': address?.countryCode,
      },
    };
  }

  allowanceChargeToXmlNode(charge: AllowanceCharge, currency: CurrencyCode) {
    return {
      'cbc:ChargeIndicator': charge.isCharge,
      'cbc:AllowanceChargeReason': charge.reasonText,
      'cbc:AllowanceChargeReasonCode': charge.reasonCode,
      'cbc:Amount': {
        '#text': formatNumber(charge.amount),
        attr_currencyID: currency?.toPrimitive(),
      },
      'cbc:BaseAmount': charge.baseAmount && {
        '#text': formatNumber(charge.baseAmount),
        attr_currencyID: currency?.toPrimitive(),
      },
      'cbc:MultiplierFactorNumeric': formatNumber(charge.factorAmount),
      'cac:TaxCategory': {
        'cbc:ID': charge.tax?.id?.toPrimitive().split(':')[0],
        'cbc:Percent': formatNumber(charge.tax?.percent),
        'cbc:TaxExemptionReason': charge.tax?.taxExemptionReason,
        'cbc:TaxExemptionReasonCode': charge.tax?.taxExemptionReasonCode,
        'cac:TaxScheme': charge.tax && {
          'cbc:ID': 'VAT',
        },
      },
    };
  }
}
