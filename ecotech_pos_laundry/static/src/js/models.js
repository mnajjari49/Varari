odoo.define('ecotech_pos_laundry.models', function (require) {

    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');
    var field_utils = require('web.field_utils');
    var session = require('web.session');
    var time = require('web.time');
    var utils = require('web.utils');
    var round_pr = utils.round_precision;

    models.load_fields("res.partner", ['remaining_credit_limit','last_visit_date','credit_limit',
                                        'mobile', 'date_of_birth', 'civil_id', 'customer_preference_ids']);
    models.load_fields("res.users", ['allow_order_screen', 'enable_adjustment',
                                        'enable_pos_report', 'enable_membership_card']);
    models.load_fields("pos.payment.method", ['allow_for_adjustment','allow_for_membership_card','pos_payment_ref']);
    models.load_fields("product.product", ['arabic_name','label_count']);

    models.PosModel.prototype.models.push({
        model:  'customer.preference',
        fields: [],
        loaded: function(self,customer_preference){
            self.customer_preference = customer_preference;
            self.set({'preference_list' : customer_preference});
            self.db.add_customer_preference(customer_preference);
        },
    },
    {
        model: 'res.partner',
        label: 'load_partners',
        fields: ['name','street','city','state_id','country_id','vat',
                 'phone','zip','mobile','email','barcode','write_date',
                 'property_account_position_id','property_product_pricelist','customer_preference_ids'],
        loaded: function(self,partners){
            self.partners = partners;
            self.partner_customer_preference = {};
            self.db.add_partners(partners);
        },
    },
    {
        model:  'membership.card.type',
        fields: ['name'],
        loaded: function(self,card_type){
            self.membership_card_type = card_type;
        },
    },{
        model:  'pos.session',
        fields: [],
        domain: function(self) { return [['config_id', '=', self.config.id]]; },
        loaded: function(self,sessions){
            self.session_ids = _.pluck(sessions, 'id');
        },
    },{
        model:  'adjustment.reason',
        fields: [],
        loaded: function(self,reasons){
            self.adjustment_reason = reasons;
            self.adjustment_reason_by_id = {};
            _.each(reasons, function(reason){
                self.adjustment_reason_by_id[reason['id']] = reason;
            });
        },
    },{
        model:  'customer.adjustment',
        fields: [],
        loaded: function(self,adjustment){
            self.customer_adjustment = adjustment;
            self.db.add_adjustment(adjustment);
            self.set('adjustment_list', adjustment);
        },
    },{
        model:  'membership.amount',
        loaded: function(self,amount){
            self.membership_amount_by_id = {};
          _.each(amount, function(each_amount){
                self.membership_amount_by_id[each_amount['id']] = each_amount;
            });          
        },
    },{
        model:  'pos.order.delivery.state',
        loaded: function(self,state){
            self.delivery_state = [];
            self.db.add_delivery_state(state);
            _.each(state, function(res){
                self.delivery_state.push(res);
            });
        },
    },{
        model:  'pos.order.rack',
        domain: function(self) { return [['config_id', '=', self.config.id]]; },
        loaded: function(self,rack){
            self.db.add_rack(rack);
            self.set({'rack_list' : rack});
        }, 
    },{
        model:  'membership.card',
        fields: ['card_no','card_value','card_type','customer_id','issue_date','expire_date','is_active'],
        domain: [['is_active', '=', true]],
        loaded: function(self, membership_cards){
            self.db.add_membership_card(membership_cards);
            self.set({'membership_card_order_list' : membership_cards});
        },
    });
    //OrderLines
    var _super_Orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        export_for_printing: function(){
            var self =  this;
            var orderlines = _super_Orderline.export_for_printing.call(this);
            var new_val = {   
            product_name_arabic: this.get_product().arabic_name,           
            label_count: this.get_product().label_count,
            };
            $.extend(orderlines, new_val);
            return orderlines;
        },
    });
    //Orders
    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function(attr, options){
            var self = this;
            var draft_order = false;
            this.promise_date = this.get_default_promise();
            var res = _super_Order.initialize.call(this, attr, options);
            //Membership Card Code Start
            this.membership_card = [];
            this.redeem =[];
            this.recharge=[];
            this.date=[];
            this.rack = false;
            this.adjustment = [];
            this.previous = [];
            //Membership Card Code End
            this.set({
                'paying_order': false,
                'partial_paid_order':false,
                'draft_order':false,
                'membership_order':false,
            })
            this.is_adjustment = false;
            this.is_previous_order = false;
            return res;
        },

        set_rack: function(rack){
            this.rack = rack;
        },
        get_rack: function(){
            return this.rack;
        },
        set_customer_adjustment: function(adjustment) {
            this.adjustment.push(adjustment);
        },
        set_customer_previous: function(prev) {
            this.previous.push(prev);
        },
        get_customer_adjustment: function() {
            return this.adjustment;
        },
        //Membership Card Code Start
        set_membership_order: function(value) {
            this.set('membership_order', value);
        },
        get_membership_order: function() {
            return this.get('membership_order');
        },
        set_membership_card: function(card) {
            this.membership_card.push(card)
        },
        get_membership_card: function() {
            return this.membership_card;
        },
        set_recharge_membership_card: function(recharge) {
            this.recharge.push(recharge)
        },
        get_recharge_membership_card: function(){
            return this.recharge;
        },
        set_redeem_membership_card: function(redeem) {
            this.redeem.push(redeem)
        },
        get_redeem_membership_card: function() {
            return this.redeem;
        },
        remove_card:function(code){
            var redeem = _.reject(this.redeem, function(objArr){ return objArr.redeem_card == code });
            this.redeem = redeem
        },
        set_free_data: function(freedata) {
            this.freedata = freedata;
        },
        get_free_data: function() {
            return this.freedata;
        },
        //Membership Card Code End
        set_order_promise_date: function(date){
            this.promise_date = date;
        },
        get_order_promise_date: function(){
            var time1 =  time.getLangDatetimeFormat()
            this.promise_date = moment(field_utils.format.datetime(moment(this.promise_date), {}, {timezone: false}),time1);
            return this.promise_date;
        },
        generateUniqueId_barcode: function() {
            return new Date().getTime();
        },
        generate_unique_id: function() {
            var timestamp = new Date().getTime();
            return Number(timestamp.toString().slice(-10));
        },
        // Order History
        set_sequence:function(sequence){
            this.set('sequence',sequence);
        },
        get_sequence:function(){
            return this.get('sequence');
        },
        set_draft_order: function(value){
            this.set('draft_order', value);
        },
        get_draft_order: function(){
            return this.get('draft_order');
        },
        set_order_id: function(order_id){
            this.set('order_id', order_id);
        },
        get_order_id: function(){
            return this.get('order_id');
        },
        set_amount_paid: function(amount_paid) {
            this.set('amount_paid', amount_paid);
        },
        get_amount_paid: function() {
            return this.get('amount_paid');
        },
        set_amount_return: function(amount_return) {
            this.set('amount_return', amount_return);
        },
        get_amount_return: function() {
            return this.get('amount_return');
        },
        set_amount_tax: function(amount_tax) {
            this.set('amount_tax', amount_tax);
        },
        get_amount_tax: function() {
            return this.get('amount_tax');
        },
        set_amount_total: function(amount_total) {
            this.set('amount_total', amount_total);
        },
        get_amount_total: function() {
            return this.get('amount_total');
        },
        set_company_id: function(company_id) {
            this.set('company_id', company_id);
        },
        get_company_id: function() {
            return this.get('company_id');
        },
        set_date_order: function(date_order) {
            this.set('date_order', date_order);
        },
        get_date_order: function() {
            return this.get('date_order');
        },
        set_pos_reference: function(pos_reference) {
            this.set('pos_reference', pos_reference)
        },
        get_pos_reference: function() {
            return this.get('pos_reference')
        },
        set_user_name: function(user_id) {
            this.set('user_id', user_id);
        },
        get_user_name: function() {
            return this.get('user_id');
        },
        set_journal: function(statement_ids) {
            this.set('statement_ids', statement_ids)
        },
        get_journal: function() {
            return this.get('statement_ids');
        },
        get_change: function(paymentline) {
            if (!paymentline) {
                if(this.get_total_paid() > 0){
                    var change = this.get_total_paid() - this.get_total_with_tax();
                }else{
                    var change = this.get_amount_return();
                }
            } else {
                var change = -this.get_total_with_tax(); 
                var lines  = this.pos.get_order().get_paymentlines();
                for (var i = 0; i < lines.length; i++) {
                    change += lines[i].get_amount();
                    if (lines[i] === paymentline) {
                        break;
                    }
                }
            }
            return round_pr(Math.max(0,change), this.pos.currency.rounding);
        },
        get_default_promise: function(){
            var date = new Date();
            var time1 =  time.getLangDatetimeFormat()
            return moment(field_utils.format.datetime(moment(date.setDate(date.getDate() + 1)), {}, {timezone: false}),time1);
        },
//        Draft and Partial Paid order
        set_draft_order: function(value){
            this.set('draft_order', value);
        },
        get_draft_order: function(){
            return this.get('draft_order');
        },
        set_partial_paid_order: function(value){
            this.set('partial_paid_order', value);
        },
        get_partial_paid_order: function(){
            return this.get('partial_paid_order');
        },
        set_is_customer_adjustment: function(flag){
            this.is_adjustment = flag;
        },
        get_is_customer_adjustment: function(){
            return this.is_adjustment;
        },
       set_is_previous_order: function(flag){
            this.is_previous_order = flag;
        },
        get_is_previous_ordert: function(){
            return this.is_previous_order;
        },

        export_as_JSON: function() {
            var new_val = {};
            var orders = _super_Order.export_as_JSON.call(this);
            new_val = {
                old_order_id: this.get_order_id(),
                draft_order:this.get_draft_order(),
                sequence: this.get_sequence(),
                pos_reference: this.get_pos_reference(),
                amount_due: this.get_due() ? this.get_due() : 0.00,
                promise_date: this.get_order_promise_date(),
                is_membership_order : this.get_membership_order(),
                membership_card: this.get_membership_card() || false,
                redeem: this.get_redeem_membership_card() || false,
                recharge: this.get_recharge_membership_card() || false,
                is_partial_paid: this.get_partial_paid_order(),
                is_adjustment : this.get_is_customer_adjustment(),
                is_previous_order : this.get_is_previous_ordert(),
                delivery_state_id : this.pos.config.default_delivery_state[0] || false,
                order_rack_id: this.get_rack() || [],
                adjustment: this.get_customer_adjustment() || [],
            }
            $.extend(orders, new_val);
            return orders;
        },
        export_for_printing: function(){
            var self =  this;
            var orders = _super_Order.export_for_printing.call(this);
            var last_paid_amt = 0;
            var currentOrderLines = this.get_orderlines();
            if(currentOrderLines.length > 0) {
                _.each(currentOrderLines,function(item) {
                    if(self.pos.config.enable_partial_payment &&
                            item.get_product().id == self.pos.config.prod_for_payment[0] ){
                        last_paid_amt = item.get_display_price()
                    }
                });
            }
            var total_paid_amt = this.get_total_paid()-last_paid_amt
            var new_val = {
                reprint_payment: this.get_journal() || false,
                ref: this.get_pos_reference() || false,
                date_order: this.get_date_order() || false,
                last_paid_amt: last_paid_amt || 0,
                total_paid_amt: total_paid_amt || false,
                amount_due: this.get_due() ? this.get_due() : 0.00,
                old_order_id: this.get_order_id(),
                draft_order:this.get_draft_order(),
                promise_date: this.get_order_promise_date(),
                client: this.get_client(),
                membership_card: this.get_membership_card() || false,
                redeem: this.get_redeem_membership_card() || false,
                recharge: this.get_recharge_membership_card() || false,
                free:this.get_free_data()|| false
            };
            $.extend(orders, new_val);
            return orders;
        },
        set_date_order: function(val){
            this.set('date_order',val)
        },
        get_date_order: function(){
            return this.get('date_order')
        },
        set_paying_order: function(val){
            this.set('paying_order',val)
        },
        get_paying_order: function(){
            return this.get('paying_order')
        },
       add_paymentline_with_notes: function(payment_method, infos) {
        this.assert_editable();
        var newPaymentline = new models.Paymentline({},{order: this, payment_method:payment_method, pos: this.pos});
        $.extend(newPaymentline, infos);
        if(payment_method.is_cash_count !== true || this.pos.config.iface_precompute_cash){
            newPaymentline.set_amount( Math.max(this.get_due(),0) );
        }
        this.paymentlines.add(newPaymentline);
        this.select_paymentline(newPaymentline);
    },
        add_paymentline_with_details: function(payment_method, infos) {
        this.assert_editable();
        var newPaymentline = new models.Paymentline({},{order: this, payment_method:payment_method, pos: this.pos});
        $.extend(newPaymentline, infos);

        if(payment_method.is_cash_count !== true || this.pos.config.iface_precompute_cash){
            newPaymentline.set_amount( Math.max(this.get_due(),0) );
        }
        this.paymentlines.add(newPaymentline);
        this.select_paymentline(newPaymentline);
    },

    });
    
    var _super_posmodel = models.PosModel;
     models.PosModel = models.PosModel.extend({
        initialize: function(session, attributes) {
            _super_posmodel.prototype.initialize.call(this, session, attributes);
            this.domain_as_args = [];
            this.set({
                'pos_order_list':[],
            });
        },
        fetch: function(model, fields, domain, ctx){
            this._load_progress = (this._load_progress || 0) + 0.05; 
            this.chrome.loading_message(('Loading')+' '+model,this._load_progress);
            return new Model(model).query(fields).filter(domain).context(ctx).all()
        },
        get_valid_promise_date: function (date) {
            var formatted_validation_date = field_utils.format.datetime(
                moment(date), {}, {timezone: true});
            return moment(formatted_validation_date).format('DD/MM/YYYY HH:mm:ss');
        },
        load_server_data: function(){
            var self = this;
            var loaded = _super_posmodel.prototype.load_server_data.call(this);
            loaded = loaded.then(function(){
                var from_date = moment().format('YYYY-MM-DD')
                var loaded_days = self.config.last_days;
                from_date = moment().subtract(loaded_days, 'days').format('YYYY-MM-DD');
                self.domain_as_args = [
                                        ['state','not in',['cancel']], ['session_id', 'in', self.session_ids],
                                        ['date_order', '>=', from_date],['is_membership_order','=',false],
                                        ['is_adjustment','=',false],['is_previous_order','=',false],
                                      ];

                new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'pos.order',
                        method: 'ac_pos_search_read',
                        args: [{'domain': self.domain_as_args}],
                    }, {
                        timeout: 3000,
                        shadow: true,
                    })
                    .then(function(orders){
                        if(orders.length > 0){
                            self.db.add_orders(orders);
                        } else {
                            reject();
                        }
                    }, function (type, err) { reject(); });
                });

                var OrderPromise =new Promise(function (resolve, reject) {
                    var s_date= moment('00:00:00', 'HH:mm:ss').utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');
                    var e_date = moment('23:59:59', 'HH:mm:ss').utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');
                    self.report_domain = [
                                    ['promise_date', '>=', s_date],['session_id', '=', self.session_ids],
                                    ['promise_date', '<=', e_date],['is_membership_order','=',false],
                                    ['is_adjustment','=',false], ['is_previous_order','=',false], ['delivery_state_Short_code', 'not in', ['ready_to_deliver', 'delivered']]
                                 ];
                    rpc.query({
                        model: 'pos.order',
                        method: 'search_read',
                        domain: self.report_domain,
                    }, {
                        timeout: 3000,
                        shadow: true,
                    })
                    .then(function(orders){
                        if(orders.length > 0){
                            resolve(orders)
                        } else {
                            reject();
                        }
                    }, function (type, err) { reject(); });
                });
                OrderPromise.then(function(orders){
                    self.set({'pos_report_order_list' : orders});
                    self.db.add_orders(orders);
                }).catch(function(){
                    self.set({'pos_report_order_list' : []});
                    console.log("No Date Found");
                })
            });
            return loaded;
        },
        _save_to_server: function (orders, options) {
            var self = this;
            return _super_posmodel.prototype._save_to_server.apply(this, arguments)
            .then(function(server_ids){
                self.gui.chrome.screens.orderlist.reloading_orders();
                self.gui.chrome.screens.posreportscreen.reloading_orders();
                self.gui.chrome.screens.customeradjustmentlistscreen.reloading_adjustment();
                if (server_ids[0]){
                    if(server_ids.length > 0 && self.config.enable_partial_payment){
                        new Promise(function (resolve, reject) {
                            rpc.query({
                                model: 'pos.order',
                                method: 'ac_pos_search_read',
                                args: [{'domain': [['id','=',[server_ids[0].id]]]}],
                            }, {
                                timeout: 3000,
                                shadow: true,
                            })
                            .then(function(orders){
                                if(orders.length > 0){
                                    orders = orders[0];
                                    var exist_order = _.findWhere(self.get('pos_order_list'), {'pos_reference': orders.pos_reference})
                                    if(exist_order){
                                        _.extend(exist_order, orders);
                                    } else {
                                        self.get('pos_order_list').push(orders);
                                    }
                                    var new_orders = _.sortBy(self.get('pos_order_list'), 'id').reverse();
                                    self.db.add_orders(new_orders);
                                    self.load_orders();
//                                    self.set({ 'pos_order_list' : new_orders });
                                    resolve();
                                } else {
                                    reject();
                                }
                            }, function (type, err) { reject(); });
                        });
                    }
                }
            });
        },
        // reload the list of partner, returns as a deferred that resolves if there were
        // updated partners, and fails if not
        load_new_partners: function(){
            var self = this;
            var def  = new $.Deferred();
            var domain = [['customer','=',true],['write_date','>',this.db.get_partner_write_date()]];
            var fields = _.find(this.models,function(model){ return model.model === 'res.partner'; }).fields;
            return new Promise(function (resolve, reject) {
                var fields = _.find(self.models, function(model){ return model.label === 'load_partners'; }).fields;
                var domain = self.prepare_new_partners_domain();
                rpc.query({
                    model: 'res.partner',
                    method: 'search_read',
                    args: [domain, fields],
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function(partners){
                    _.each(partners, function(partner){
                        if(self.db.partner_by_id[partner.id]){
                            var id = partner.id;
                            delete self.db.partner_by_id[partner.id]
                        }
                    });
                    if (self.db.add_partners(partners)) {   // check if the partners we got were real updates
                        resolve();
                    } else {
                        reject();
                    }
                }, function(type,err){ def.reject(); });
            });
        },
    });

    var _super_paymentline = models.Paymentline.prototype;
    models.Paymentline = models.Paymentline.extend({
    init_from_JSON: function (json) {
        _super_paymentline.init_from_JSON.apply(this, arguments);
        this.payment_ref = json.payment_ref;
        this.note = json.note;
    },
     export_as_JSON: function () {
        return _.extend(_super_paymentline.export_as_JSON.apply(this, arguments), {
            note: this.note,
            payment_ref: this.payment_ref,

        });
    },
        set_membership_card_line_code: function(code) {
            this.code = code;
        },
        get_membership_card_line_code: function(){
            return this.code;
        },
        set_freeze: function(freeze) {
            this.freeze = freeze;
        },
        get_freeze: function(){
            return this.freeze;
        },
    });
});
