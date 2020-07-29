# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

import logging
from collections import defaultdict
from odoo.tools import float_is_zero
from odoo import fields, models, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'
    payments = fields.One2many("pos.payment",'session_id')

    def _check_if_no_draft_orders(self):
        if not self.config_id.enable_partial_payment:
            super(PosSession, self)._check_if_no_draft_orders()
        else:
            return True

    def _create_adjustment_payment(self, order, payment):
        adjustment_amount = {'amount': 0.0, 'amount_converted': 0.0}
        customer_income_account = order.partner_id.property_account_receivable_id.id
        credit = False
        debit = False
        customer_adjustment_args = {
            'partner_id': order.partner_id.id,
            'move_id': self.move_id.id,
        }
        if payment.amount < 0:
            debit = True
            adjustment_amount['amount'] = -1 * payment.amount
        else:
            adjustment_amount['amount'] = payment.amount
            credit = True

        if not self.is_in_company_currency:
            adjustment_amount['amount_converted'] = self.company_id.currency_id.round(
                adjustment_amount['amount'])
        else:
            adjustment_amount['amount_converted'] = adjustment_amount['amount']
        customer_adjustment_args['account_id'] = customer_income_account
        if debit:
            customer_adjust_vals = [
                self._debit_amounts(customer_adjustment_args, adjustment_amount['amount'],
                                     adjustment_amount['amount_converted'])
            ]
        if credit:
            customer_adjust_vals = [
                self._credit_amounts(customer_adjustment_args, adjustment_amount['amount'],
                                    adjustment_amount['amount_converted'])
            ]

        self.env['account.move.line'].with_context(check_move_validity=False).create(
            customer_adjust_vals)


    def _create_memebership_payment(self, order, payment):
        memebership_amount = {'amount': 0.0, 'amount_converted': 0.0}
        customer_income_account = order.partner_id.property_account_receivable_id.id
        memebership_args = {
            'name': 'Membership Sale',
            'partner_id': order.partner_id.id,
            'move_id': self.move_id.id,
        }
        memebership_amount['amount'] = payment.amount
        if not self.is_in_company_currency:
            memebership_amount['amount_converted'] = self.company_id.currency_id.round(
                memebership_amount['amount'])
        else:
            memebership_amount['amount_converted'] = memebership_amount['amount']
        memebership_args['account_id'] = customer_income_account
        memebership_vals = [
            self._debit_amounts(memebership_args, memebership_amount['amount'],
                                 memebership_amount['amount_converted'])
        ]
        self.env['account.move.line'].with_context(check_move_validity=False).create(
            memebership_vals)

    def _create_account_move(self):
        """ Create account.move and account.move.line records for this session.

        Side-effects include:
            - setting self.move_id to the created account.move record
            - creating and validating account.bank.statement for cash payments
            - reconciling cash receivable lines, invoice receivable lines and stock output lines
        """
        journal = self.config_id.journal_id
        # Passing default_journal_id for the calculation of default currency of account move
        # See _get_default_currency in the account/account_move.py.
        account_move = self.env['account.move'].with_context(default_journal_id=journal.id).create({
            'journal_id': journal.id,
            'date': fields.Date.context_today(self),
            'ref': self.name,
        })
        self.write({'move_id': account_move.id})

        ## SECTION: Accumulate the amounts for each accounting lines group
        # Each dict maps `key` -> `amounts`, where `key` is the group key.
        # E.g. `combine_receivables` is derived from pos.payment records
        # in the self.order_ids with group key of the `payment_method_id`
        # field of the pos.payment record.
        amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0}
        tax_amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0, 'base_amount': 0.0}
        split_receivables = defaultdict(amounts)
        split_receivables_cash = defaultdict(amounts)
        membership_receivable = defaultdict(amounts)
        combine_receivables = defaultdict(amounts)
        combine_receivables_cash = defaultdict(amounts)
        invoice_receivables = defaultdict(amounts)
        sales = defaultdict(amounts)
        taxes = defaultdict(tax_amounts)
        stock_expense = defaultdict(amounts)
        stock_output = defaultdict(amounts)
        # Track the receivable lines of the invoiced orders' account moves for reconciliation
        # These receivable lines are reconciled to the corresponding invoice receivable lines
        # of this session's move_id.
        order_account_move_receivable_lines = defaultdict(lambda: self.env['account.move.line'])
        rounded_globally = self.company_id.tax_calculation_rounding_method == 'round_globally'
        list_of_orders=self.order_ids.mapped('id')
        additional_list=self.payments.filtered(lambda a:a.pos_order_id.session_id.id!= self.id).mapped("id")
        list_of_orders += list(set(self.payments.filtered(lambda a:a.pos_order_id.session_id.id!= self.id).mapped("pos_order_id.id")))
        print(list_of_orders,'\n',additional_list)
        # for payment in self.payments.filtered(lambda a: a.pos_order_id.session_id.id != self.id):
        #     list_of_orders += payment.pos_order_id

        for order in self.env["pos.order"].browse(list_of_orders):
            if order.partial_paid_order or order.draft_order:
                continue
            # Combine pos receivable lines
            # Separate cash payments for cash reconciliation later.
            for payment in order.payment_ids:
                amount, date = payment.amount, payment.payment_date
                if payment.payment_method_id.split_transactions:
                    if payment.payment_method_id.is_cash_count:
                        if payment.payment_method_id.allow_for_membership_card:
                            self._create_memebership_payment(order, payment)
                        elif payment.payment_method_id.allow_for_adjustment:
                            self._create_adjustment_payment(order, payment)
                        else:
                            split_receivables_cash[payment] = self._update_amounts(split_receivables_cash[payment], {'amount': amount}, date)
                    else:
                        if payment.payment_method_id.allow_for_membership_card:
                            self._create_memebership_payment(order, payment)
                        elif payment.payment_method_id.allow_for_adjustment:
                            self._create_adjustment_payment(order, payment)
                        else:
                            split_receivables[payment] = self._update_amounts(split_receivables[payment], {'amount': amount}, date)
                else:
                    key = payment.payment_method_id
                    if payment.payment_method_id.is_cash_count:
                        if payment.payment_method_id.allow_for_membership_card:
                            self._create_memebership_payment(order, payment)
                        elif payment.payment_method_id.allow_for_adjustment:
                            self._create_adjustment_payment(order, payment)
                        else:
                            combine_receivables_cash[key] = self._update_amounts(combine_receivables_cash[key], {'amount': amount}, date)
                    else:
                        if payment.payment_method_id.allow_for_membership_card:
                            self._create_memebership_payment(order, payment)
                        elif payment.payment_method_id.allow_for_adjustment:
                            self._create_adjustment_payment(order, payment)
                        else:
                            combine_receivables[key] = self._update_amounts(combine_receivables[key], {'amount': amount}, date)
            if order.is_invoiced:
                # Combine invoice receivable lines
                key = order.partner_id.property_account_receivable_id.id
                invoice_receivables[key] = self._update_amounts(invoice_receivables[key], {'amount': order._get_amount_receivable()}, order.date_order)
                # side loop to gather receivable lines by account for reconciliation
                for move_line in order.account_move.line_ids.filtered(lambda aml: aml.account_id.internal_type == 'receivable'):
                    order_account_move_receivable_lines[move_line.account_id.id] |= move_line
            elif order.is_adjustment:
                adjustment_amount = {'amount': 0.0, 'amount_converted': 0.0}
                customer_adjustment_account = self.config_id.acc_for_adjustment.id
                credit = False
                debit = False
                customer_adjustment_args = {
                    'name': 'Customer Adjustment',
                    'partner_id': order.partner_id.id,
                    'move_id': self.move_id.id,
                }
                for payment in order.payment_ids.filtered(lambda payment: payment.payment_method_id.allow_for_adjustment):
                    adjustment_amount['amount'] += payment.amount
                if adjustment_amount['amount'] < 0:
                    credit = True
                    adjustment_amount['amount'] = adjustment_amount['amount'] * -1
                else:
                    debit = True

                if not self.is_in_company_currency:
                    adjustment_amount['amount_converted'] = self.company_id.currency_id.round(
                        adjustment_amount['amount'])
                else:
                    adjustment_amount['amount_converted'] = adjustment_amount['amount']
                customer_adjustment_args['account_id'] = customer_adjustment_account
                if credit:
                    adjustment_vals = [
                        self._credit_amounts(customer_adjustment_args, adjustment_amount['amount'],
                                             adjustment_amount['amount_converted'])
                    ]
                if debit:
                    adjustment_vals = [
                        self._debit_amounts(customer_adjustment_args, adjustment_amount['amount'],
                                            adjustment_amount['amount_converted'])
                    ]
                self.env['account.move.line'].with_context(check_move_validity=False).create(adjustment_vals)
            elif order.is_membership_order:
                memebership_amount = {'amount': 0.0, 'amount_converted': 0.0}
                customer_income_account = order.partner_id.property_account_receivable_id.id
                memebership_args = {
                    'name': 'Memebership Sale',
                    'partner_id':order.partner_id.id,
                    'move_id': self.move_id.id,
                }
                for payment in order.payment_ids.filtered(
                        lambda payment: payment.session_id.id == self.id and not payment.old_session_id):
                    memebership_amount['amount'] += payment.amount
                if not self.is_in_company_currency:
                    memebership_amount['amount_converted'] = self.company_id.currency_id.round(memebership_amount['amount'])
                else:
                    memebership_amount['amount_converted'] = memebership_amount['amount']
                memebership_args['account_id'] = customer_income_account
                memebership_vals = [
                    self._credit_amounts(memebership_args, memebership_amount['amount'], memebership_amount['amount_converted'])
                ]
                self.env['account.move.line'].with_context(check_move_validity=False).create(memebership_vals)
            else:
                order_taxes = defaultdict(tax_amounts)
                for order_line in order.lines:
                    line = self._prepare_line(order_line)
                    # Combine sales/refund lines
                    sale_key = (
                        # account
                        line['income_account_id'],
                        # sign
                        -1 if line['amount'] < 0 else 1,
                        # for taxes
                        tuple((tax['id'], tax['account_id'], tax['tax_repartition_line_id']) for tax in line['taxes']),
                    )
                    sales[sale_key] = self._update_amounts(sales[sale_key], {'amount': line['amount']}, line['date_order'])
                    # Combine tax lines
                    for tax in line['taxes']:
                        tax_key = (tax['account_id'], tax['tax_repartition_line_id'], tax['id'], tuple(tax['tag_ids']))
                        order_taxes[tax_key] = self._update_amounts(
                            order_taxes[tax_key],
                            {'amount': tax['amount'], 'base_amount': tax['base']},
                            tax['date_order'],
                            round=not rounded_globally
                        )
                for tax_key, amounts in order_taxes.items():
                    if rounded_globally:
                        amounts = self._round_amounts(amounts)
                    for amount_key, amount in amounts.items():
                        taxes[tax_key][amount_key] += amount

                if self.company_id.anglo_saxon_accounting:
                    # Combine stock lines
                    stock_moves = self.env['stock.move'].search([
                        ('picking_id', '=', order.picking_id.id),
                        ('company_id.anglo_saxon_accounting', '=', True),
                        ('product_id.categ_id.property_valuation', '=', 'real_time')
                    ])
                    for move in stock_moves:
                        exp_key = move.product_id.property_account_expense_id or move.product_id.categ_id.property_account_expense_categ_id
                        out_key = move.product_id.categ_id.property_stock_account_output_categ_id
                        amount = -sum(move.stock_valuation_layer_ids.mapped('value'))
                        stock_expense[exp_key] = self._update_amounts(stock_expense[exp_key], {'amount': amount}, move.picking_id.date)
                        stock_output[out_key] = self._update_amounts(stock_output[out_key], {'amount': amount}, move.picking_id.date)

                # Increasing current partner's customer_rank
                order.partner_id._increase_rank('customer_rank')

        ## SECTION: Create non-reconcilable move lines
        # Create account.move.line records for
        #   - sales
        #   - taxes
        #   - stock expense
        #   - non-cash split receivables (not for automatic reconciliation)
        #   - non-cash combine receivables (not for automatic reconciliation)
        MoveLine = self.env['account.move.line'].with_context(check_move_validity=False)

        tax_vals = [self._get_tax_vals(key, amounts['amount'], amounts['amount_converted'], amounts['base_amount']) for key, amounts in taxes.items() if amounts['amount']]
        # Check if all taxes lines have account_id assigned. If not, there are repartition lines of the tax that have no account_id.
        tax_names_no_account = [line['name'] for line in tax_vals if line['account_id'] == False]
        if len(tax_names_no_account) > 0:
            error_message = _(
                'Unable to close and validate the session.\n'
                'Please set corresponding tax account in each repartition line of the following taxes: \n%s'
            ) % ', '.join(tax_names_no_account)
            raise UserError(error_message)
        MoveLine.create(
            tax_vals
            + [self._get_sale_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in sales.items()]
            + [self._get_stock_expense_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in stock_expense.items()]
            + [self._get_split_receivable_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in split_receivables.items()]
            + [self._get_combine_receivable_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in combine_receivables.items()]
        )

        ## SECTION: Create cash statement lines and cash move lines
        # Create the split and combine cash statement lines and account move lines.
        # Keep the reference by statement for reconciliation.
        # `split_cash_statement_lines` maps `statement` -> split cash statement lines
        # `combine_cash_statement_lines` maps `statement` -> combine cash statement lines
        # `split_cash_receivable_lines` maps `statement` -> split cash receivable lines
        # `combine_cash_receivable_lines` maps `statement` -> combine cash receivable lines
        statements_by_journal_id = {statement.journal_id.id: statement for statement in self.statement_ids}
        # handle split cash payments
        split_cash_statement_line_vals = defaultdict(list)
        split_cash_receivable_vals = defaultdict(list)
        for payment, amounts in split_receivables_cash.items():
            statement = statements_by_journal_id[payment.payment_method_id.cash_journal_id.id]
            split_cash_statement_line_vals[statement].append(self._get_statement_line_vals(statement, payment.payment_method_id.receivable_account_id, amounts['amount']))
            if (not order.is_membership_order) or (not order.is_adjustment):
                split_cash_receivable_vals[statement].append(
                    self._get_split_receivable_vals(payment, amounts['amount'], amounts['amount_converted']))
            else:
                partner_name = self.env["res.partner"]._find_accounting_partner(payment.partner_id).name
                partial_vals = {
                    'account_id': payment.payment_method_id.receivable_account_id.id,
                    'move_id': self.move_id.id,
                    'name': '%s - %s - %s' % (self.name, payment.payment_method_id.name, partner_name),
                }
                cash_debit = self._debit_amounts(partial_vals, amounts['amount'], amounts['amount_converted'])
                split_cash_receivable_vals[statement].append(cash_debit)

        # handle combine cash payments
        combine_cash_statement_line_vals = defaultdict(list)
        combine_cash_receivable_vals = defaultdict(list)
        for payment_method, amounts in combine_receivables_cash.items():
            if not float_is_zero(amounts['amount'] , precision_rounding=self.currency_id.rounding):
                statement = statements_by_journal_id[payment_method.cash_journal_id.id]
                combine_cash_statement_line_vals[statement].append(self._get_statement_line_vals(statement, payment_method.receivable_account_id, amounts['amount']))
                combine_cash_receivable_vals[statement].append(self._get_combine_receivable_vals(payment_method, amounts['amount'], amounts['amount_converted']))
        # create the statement lines and account move lines
        BankStatementLine = self.env['account.bank.statement.line']
        split_cash_statement_lines = {}
        combine_cash_statement_lines = {}
        split_cash_receivable_lines = {}
        combine_cash_receivable_lines = {}
        for statement in self.statement_ids:
            split_cash_statement_lines[statement] = BankStatementLine.create(split_cash_statement_line_vals[statement])
            combine_cash_statement_lines[statement] = BankStatementLine.create(combine_cash_statement_line_vals[statement])
            split_cash_receivable_lines[statement] = MoveLine.create(split_cash_receivable_vals[statement])
            combine_cash_receivable_lines[statement] = MoveLine.create(combine_cash_receivable_vals[statement])

        ## SECTION: Create invoice receivable lines for this session's move_id.
        # Keep reference of the invoice receivable lines because
        # they are reconciled with the lines in order_account_move_receivable_lines
        invoice_receivable_vals = defaultdict(list)
        invoice_receivable_lines = {}
        for receivable_account_id, amounts in invoice_receivables.items():
            invoice_receivable_vals[receivable_account_id].append(self._get_invoice_receivable_vals(receivable_account_id, amounts['amount'], amounts['amount_converted']))
        for receivable_account_id, vals in invoice_receivable_vals.items():
            invoice_receivable_lines[receivable_account_id] = MoveLine.create(vals)

        ## SECTION: Create stock output lines
        # Keep reference to the stock output lines because
        # they are reconciled with output lines in the stock.move's account.move.line
        stock_output_vals = defaultdict(list)
        stock_output_lines = {}
        for output_account, amounts in stock_output.items():
            stock_output_vals[output_account].append(self._get_stock_output_vals(output_account, amounts['amount'], amounts['amount_converted']))
        for output_account, vals in stock_output_vals.items():
            stock_output_lines[output_account] = MoveLine.create(vals)

        ## SECTION: Create extra move lines
        # Keep reference to the stock output lines because
        # they are reconciled with output lines in the stock.move's account.move.line
        MoveLine.create(self._get_extra_move_lines_vals())

        ## SECTION: Reconcile account move lines
        # reconcile cash receivable lines
        for statement in self.statement_ids:
            if not self.config_id.cash_control:
                statement.write({'balance_end_real': statement.balance_end})
            statement.button_confirm_bank()
            all_lines = (
                  split_cash_statement_lines[statement].mapped('journal_entry_ids').filtered(lambda aml: aml.account_id.internal_type == 'receivable')
                | combine_cash_statement_lines[statement].mapped('journal_entry_ids').filtered(lambda aml: aml.account_id.internal_type == 'receivable')
                | split_cash_receivable_lines[statement]
                | combine_cash_receivable_lines[statement]
            )
            accounts = all_lines.mapped('account_id')
            lines_by_account = [all_lines.filtered(lambda l: l.account_id == account) for account in accounts]
            for lines in lines_by_account:
                lines.reconcile()

        # reconcile invoice receivable lines
        for account_id in order_account_move_receivable_lines:
            ( order_account_move_receivable_lines[account_id]
            | invoice_receivable_lines[account_id]
            ).reconcile()

        # reconcile stock output lines
        stock_moves = self.env['stock.move'].search([('picking_id', 'in', self.order_ids.filtered(lambda order: not order.is_invoiced).mapped('picking_id').ids)])
        stock_account_move_lines = self.env['account.move'].search([('stock_move_id', 'in', stock_moves.ids)]).mapped('line_ids')
        for account_id in stock_output_lines:
            ( stock_output_lines[account_id]
            | stock_account_move_lines.filtered(lambda aml: aml.account_id == account_id)
            ).reconcile()

    def _create_partial_payment_debit(self, order, amount):
        partial_payment_amount = {'amount': 0.0, 'amount_converted': 0.0}
        customer_income_account = order.partner_id.property_account_receivable_id.id
        partial_paid_args = {
            'partner_id': order.partner_id.id,
            'move_id': self.move_id.id,
        }
        partial_payment_amount['amount'] = amount
        if not self.is_in_company_currency:
            partial_payment_amount['amount_converted'] = self.company_id.currency_id.round(
                partial_payment_amount['amount'])
        else:
            partial_payment_amount['amount_converted'] = partial_payment_amount['amount']
        partial_paid_args['account_id'] = customer_income_account
        if partial_payment_amount['amount']:
            partial_paid_vals = [
                self._debit_amounts(partial_paid_args, partial_payment_amount['amount'],
                                     partial_payment_amount['amount_converted'])
            ]
            self.env['account.move.line'].with_context(check_move_validity=False).create(
                partial_paid_vals)

    def partial_paid_credit(self, order):
        partial_payment_amount = {'amount': 0.0, 'amount_converted': 0.0}
        customer_income_account = order.partner_id.property_account_receivable_id.id
        partial_payment_amount_args = {
            'partner_id': order.partner_id.id,
            'move_id': self.move_id.id,
        }
        for payment in order.payment_ids.filtered(
                lambda payment: payment.session_id.id == self.id and not payment.old_session_id):
            partial_payment_amount['amount'] += payment.amount
        if not self.is_in_company_currency:
            partial_payment_amount['amount_converted'] = self.company_id.currency_id.round(
                partial_payment_amount['amount'])
        else:
            partial_payment_amount['amount_converted'] = partial_payment_amount['amount']
        partial_payment_amount_args['account_id'] = customer_income_account
        if partial_payment_amount['amount']:
            partial_payment_vals = [
                self._credit_amounts(partial_payment_amount_args, partial_payment_amount['amount'],
                                     partial_payment_amount['amount_converted'])
            ]
            self.env['account.move.line'].with_context(check_move_validity=False).create(partial_payment_vals)

    def _get_extra_move_lines_vals(self):
        res = super(PosSession, self)._get_extra_move_lines_vals()
        if not self.config_id.enable_partial_payment:
            return res
        amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0}
        tax_amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0, 'base_amount': 0.0}
        split_receivables = defaultdict(amounts)
        membership_receivable = defaultdict(amounts)
        split_receivables_cash = defaultdict(amounts)
        combine_receivables = defaultdict(amounts)
        combine_receivables_cash = defaultdict(amounts)
        sales = defaultdict(amounts)
        taxes = defaultdict(tax_amounts)
        stock_expense = defaultdict(amounts)
        stock_output = defaultdict(amounts)
        rounded_globally = self.company_id.tax_calculation_rounding_method == 'round_globally'
        list_of_orders = self.order_ids.mapped('id')
        additional_list = self.payments.filtered(lambda a: a.pos_order_id.session_id.id != self.id).mapped("id")
        list_of_orders += list(
            set(self.payments.filtered(lambda a: a.pos_order_id.session_id.id != self.id).mapped("pos_order_id.id")))
        # for payment in self.payments.filtered(lambda a:a.pos_order_id.session_id.id!= self.id):
        #     list_of_orders += payment.pos_order_id

        for order in self.env["pos.order"].browse(list_of_orders):
            if order.partial_paid_order or order.draft_order:
                for payment in order.payment_ids.filtered(
                        lambda payment: payment.session_id.id == self.id and not payment.old_session_id):# get all payment that is not processed before
                    amount, date, session_id, old_session_id = payment.amount, payment.payment_date, payment.session_id, payment.old_session_id
                    if payment.payment_method_id.split_transactions:
                        if payment.payment_method_id.is_cash_count:
                            if payment.payment_method_id.allow_for_membership_card:
                                self._create_memebership_payment(order, payment)
                            else:
                                split_receivables_cash[payment] = self._update_amounts(split_receivables_cash[payment],
                                                                                       {'amount': amount}, date)
                        else:
                            if payment.payment_method_id.allow_for_membership_card:
                                self._create_memebership_payment(order, payment)
                            else:
                                split_receivables[payment] = self._update_amounts(split_receivables[payment],
                                                                                  {'amount': amount}, date)
                    else:
                        key = payment.payment_method_id
                        if payment.payment_method_id.is_cash_count:
                            if payment.payment_method_id.allow_for_membership_card:
                                self._create_memebership_payment(order, payment)
                            else:
                                combine_receivables_cash[key] = self._update_amounts(combine_receivables_cash[key],
                                                                                     {'amount': amount}, date)
                        else:
                            if payment.payment_method_id.allow_for_membership_card:
                                self._create_memebership_payment(order, payment)
                            else:
                                combine_receivables[key] = self._update_amounts(combine_receivables[key],
                                                                                {'amount': amount}, date)

                if not order.is_invoiced:
                    if order.old_session_ids:
                        self.partial_paid_credit(order)
                    else:
                        order_taxes = defaultdict(tax_amounts)
                        for order_line in order.lines:
                            line = self._prepare_line(order_line)
                            # Combine sales/refund lines
                            sale_key = (
                                # account
                                line['income_account_id'],
                                # sign
                                -1 if line['amount'] < 0 else 1,
                                # for taxes
                                tuple((tax['id'], tax['account_id'], tax['tax_repartition_line_id']) for tax in
                                      line['taxes']),
                            )
                            sales[sale_key] = self._update_amounts(sales[sale_key], {'amount': line['amount']},
                                                                   line['date_order'])
                            # Combine tax lines
                            for tax in line['taxes']:
                                tax_key = (
                                    tax['account_id'], tax['tax_repartition_line_id'], tax['id'], tuple(tax['tag_ids']))
                                order_taxes[tax_key] = self._update_amounts(
                                    order_taxes[tax_key],
                                    {'amount': tax['amount'], 'base_amount': tax['base']},
                                    tax['date_order'],
                                    round=not rounded_globally
                                )
                        for tax_key, amounts in order_taxes.items():
                            if rounded_globally:
                                amounts = self._round_amounts(amounts)
                            for amount_key, amount in amounts.items():
                                taxes[tax_key][amount_key] += amount

                        if self.company_id.anglo_saxon_accounting:
                            # Combine stock lines
                            stock_moves = self.env['stock.move'].search([
                                ('picking_id', '=', order.picking_id.id),
                                ('company_id.anglo_saxon_accounting', '=', True),
                                ('product_id.categ_id.property_valuation', '=', 'real_time')
                            ])
                            for move in stock_moves:
                                exp_key = move.product_id.property_account_expense_id or move.product_id.categ_id.property_account_expense_categ_id
                                out_key = move.product_id.categ_id.property_stock_account_output_categ_id
                                amount = -sum(move.stock_valuation_layer_ids.mapped('value'))
                                stock_expense[exp_key] = self._update_amounts(stock_expense[exp_key],
                                                                              {'amount': amount}, move.picking_id.date)
                                stock_output[out_key] = self._update_amounts(stock_output[out_key], {'amount': amount},
                                                                             move.picking_id.date)
                        self.partial_paid_credit(order)
                        self._create_partial_payment_debit(order, order.amount_total)
                    # Increasing current partner's customer_rank
                    order.partner_id._increase_rank('customer_rank')
        MoveLine = self.env['account.move.line'].with_context(check_move_validity=False)

        tax_vals = [self._get_tax_vals(key, amounts['amount'], amounts['amount_converted'], amounts['base_amount']) for
                    key, amounts in taxes.items() if amounts['amount']]
        # Check if all taxes lines have account_id assigned. If not, there are repartition lines of the tax that have no account_id.
        tax_names_no_account = [line['name'] for line in tax_vals if line['account_id'] == False]
        if len(tax_names_no_account) > 0:
            error_message = _(
                'Unable to close and validate the session.\n'
                'Please set corresponding tax account in each repartition line of the following taxes: \n%s'
            ) % ', '.join(tax_names_no_account)
            raise UserError(error_message)

        statements_by_journal_id = {statement.journal_id.id: statement for statement in self.statement_ids}
        # handle split cash payments
        split_cash_statement_line_vals = defaultdict(list)
        split_cash_receivable_vals = defaultdict(list)
        for payment, amounts in split_receivables_cash.items():
            statement = statements_by_journal_id[payment.payment_method_id.cash_journal_id.id]
            split_cash_statement_line_vals[statement].append(
                self._get_statement_line_vals(statement, payment.payment_method_id.receivable_account_id,
                                              amounts['amount']))
            split_cash_receivable_vals[statement].append(
                self._get_split_receivable_vals(payment, amounts['amount'], amounts['amount_converted']))

        # handle combine cash payments
        combine_cash_statement_line_vals = defaultdict(list)
        combine_cash_receivable_vals = defaultdict(list)
        for payment_method, amounts in combine_receivables_cash.items():
            if not float_is_zero(amounts['amount'], precision_rounding=self.currency_id.rounding):
                statement = statements_by_journal_id[payment_method.cash_journal_id.id]
                combine_cash_statement_line_vals[statement].append(
                    self._get_statement_line_vals(statement, payment_method.receivable_account_id, amounts['amount']))
                combine_cash_receivable_vals[statement].append(
                    self._get_combine_receivable_vals(payment_method, amounts['amount'], amounts['amount_converted']))
        # create the statement lines and account move lines
        BankStatementLine = self.env['account.bank.statement.line']
        split_cash_statement_lines = {}
        combine_cash_statement_lines = {}
        split_cash_receivable_lines = {}
        combine_cash_receivable_lines = {}
        for statement in self.statement_ids:
            split_cash_statement_lines[statement] = BankStatementLine.create(split_cash_statement_line_vals[statement])
            combine_cash_statement_lines[statement] = BankStatementLine.create(combine_cash_statement_line_vals[statement])
            split_cash_receivable_lines[statement] = MoveLine.create(split_cash_receivable_vals[statement])
            combine_cash_receivable_lines[statement] = MoveLine.create(combine_cash_receivable_vals[statement])

        for statement in self.statement_ids:
            if not self.config_id.cash_control:
                statement.write({'balance_end_real': statement.balance_end})
            statement.button_confirm_bank()
            all_lines = (
                  split_cash_statement_lines[statement].mapped('journal_entry_ids').filtered(lambda aml: aml.account_id.internal_type == 'receivable')
                | combine_cash_statement_lines[statement].mapped('journal_entry_ids').filtered(lambda aml: aml.account_id.internal_type == 'receivable')
                | split_cash_receivable_lines[statement]
                | combine_cash_receivable_lines[statement]
            )
            accounts = all_lines.mapped('account_id')
            lines_by_account = [all_lines.filtered(lambda l: l.account_id == account) for account in accounts]
            for lines in lines_by_account:
                lines.reconcile()

        test = (tax_vals
                + [self._get_sale_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in
                   sales.items()]
                + [self._get_stock_expense_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in
                   stock_expense.items()]
                + [self._get_combine_receivable_vals(key, amounts['amount'], amounts['amount_converted']) for
                   key, amounts in combine_receivables.items()])
        if self.can_spilt():
            temp = [self._get_split_receivable_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts
                   in split_receivables.items()]
            test += temp
        return (test)

    def can_spilt(self):
       partial= self.payments.filtered(lambda a:a.session_id.id != self.id)
       return True if not partial else False

    def action_show_payments_list(self):
        res = super(PosSession, self).action_show_payments_list()
        res.update({'domain': [('session_id', '=', self.id)]})
        return res

    @api.depends('payments.amount')
    def _compute_total_payments_amount(self):
            for session in self:
                    session.total_payments_amount= sum(session.payments.mapped('amount'))

    # def _compute_order_count(self):
    #     for session in self:
    #         pos_order_count = 0
    #         for order in session.order_ids.filtered(lambda order : not (order.is_membership_order or order.is_adjustment)):
    #             if session.id == order.session_id.id:
    #                 if not order.old_session_ids:
    #                     pos_order_count+=1
    #         session.order_count = pos_order_count

    # def action_view_order(self):
    #     return {
    #         'name': _('Orders'),
    #         'res_model': 'pos.order',
    #         'view_mode': 'tree,form',
    #         'views': [
    #             (self.env.ref('point_of_sale.view_pos_order_tree_no_session_id').id, 'tree'),
    #             (self.env.ref('point_of_sale.view_pos_pos_form').id, 'form'),
    #             ],
    #         'type': 'ir.actions.act_window',
    #         'domain': [('session_id', 'in', self.ids),('old_session_ids','=',False),('is_adjustment','=',False),('is_membership_order','=',False)],
    #     }

    def action_pos_session_open(self):
        pos_order = self.env['pos.order'].search([('state', '=', 'draft')])
        for order in pos_order:
            if order.session_id.state != 'opened':
                if self.config_id == order.config_id:
                    order.current_session=self.id
                    order.write({
                        # 'session_id': self.id,
                        # 'old_session_id':order.session_id.id,
                        'old_session_ids':[(4,order.session_id.id)],
                    })
                    for payment in order.payment_ids:
                        if not payment.old_session_id:
                            payment.write({'old_session_id':order.current_session.id})
        return super(PosSession, self).action_pos_session_open()


class account_move(models.Model):
    _inherit = 'account.move'

    def _check_balanced(self):
        ''' Assert the move is fully balanced debit = credit.
        An error is raised if it's not the case.
        '''
        moves = self.filtered(lambda move: move.line_ids)
        if not moves:
            return

        # /!\ As this method is called in create / write, we can't make the assumption the computed stored fields
        # are already done. Then, this query MUST NOT depend of computed stored fields (e.g. balance).
        # It happens as the ORM makes the create with the 'no_recompute' statement.
        self.env['account.move.line'].flush(['debit', 'credit', 'move_id'])
        self.env['account.move'].flush(['journal_id'])
        self._cr.execute('''
            SELECT line.move_id, ROUND(SUM(debit - credit), currency.decimal_places)
            FROM account_move_line line
            JOIN account_move move ON move.id = line.move_id
            JOIN account_journal journal ON journal.id = move.journal_id
            JOIN res_company company ON company.id = journal.company_id
            JOIN res_currency currency ON currency.id = company.currency_id
            WHERE line.move_id IN %s
            GROUP BY line.move_id, currency.decimal_places
            HAVING ROUND(SUM(debit - credit), currency.decimal_places) != 0.0;
        ''', [tuple(self.ids)])
        query_res = self._cr.fetchall()
        if query_res:
            ids = [res[0] for res in query_res]
            sums = [res[1] for res in query_res]
            for move in moves:
                if sums and move.journal_id.name not in ['Point of Sale', 'Cash'] and move.type == 'entry':
                    raise UserError(_("Cannot create unbalanced journal entry. Ids: %s\nDifferences debit - credit: %s") % (ids, sums))

