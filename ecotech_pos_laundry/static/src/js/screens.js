    odoo.define('ecotech_pos_laundry.screens', function (require) {
    var screens = require('point_of_sale.screens');
    var gui = require('point_of_sale.gui');
    var rpc = require('web.rpc');
    var utils = require('web.utils');
    var PopupWidget = require('point_of_sale.popups');
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var QWeb = core.qweb;
    var round_pr = utils.round_precision;
    var _t = core._t;
    var Printer = require('point_of_sale.Printer').Printer;
    var time = require('web.time');
    var Session = require('web.Session');

    //Membership Card Code Start
    var MembershipCardButton = screens.ActionButtonWidget.extend({
        template: 'MembershipCardButton',
        button_click: function(){
            this.gui.show_screen('membershipcardlistscreen');
        },
    });

    screens.define_action_button({
        'name': 'membershipcardbutton',
        'widget': MembershipCardButton,
        'condition': function(){
            return this.pos.config.enable_membership_card && this.pos.user.enable_membership_card;
        },
    });

    //POS REPORT SCREEN
    var PosReportButton = screens.ActionButtonWidget.extend({
        template: 'PosReportButton',
        button_click: function(){
            this.gui.show_screen('posreportscreen');
        },
    });

    screens.define_action_button({
        'name': 'posreportbutton',
        'widget': PosReportButton,
        'condition': function(){
            return this.pos.config.enable_pos_report_days && this.pos.user.enable_pos_report;
        },
    });

    var CustomerPreferencesWidget = screens.ScreenWidget.extend({
        template: 'CustomerPreferencesWidget',
        events: {
            'click .button.back': 'click_back',
            'click .create': 'click_create_preference',
            'click #edit_preference': 'click_edit_preference',
            'click #del_preference': 'click_remove_preference',
        },
        show: function(){
            var self = this;
            self._super();
            this.renderElement();
        },
        click_back: function(){
            this.gui.back('');
        },

        click_edit_preference: function(event){
            var self  = this;
            var pref_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_preference_by_id(Number(pref_id));
            if (result) {
                self.gui.show_popup('edit_preference_popup',{name: result.name, id: result.id, desc:result.description});
            }
        },

        click_create_preference: function(){
            var self = this;
            self.gui.show_popup('edit_preference_popup', {name: '', id: false, desc:''});
        },

        click_remove_preference: function(event){
            var self  = this;
            var pref_id = parseInt($(event.currentTarget).data('id'));
            var pref_name = self.pos.db.get_preference_by_id(Number(pref_id));

            this.gui.show_popup('confirm',{
                title: _t('Remove Preference'),
                body:  _t('Do you want to remove "'+ pref_name.name +'"?'),
                confirm: function() {
                    var params = {
                        model: 'customer.preference',
                        method: 'unlink',
                        args: [pref_id],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                          self.reloading_preferences();
                          self.pos.gui.chrome.screens.clientlist.reload_partners();
                        }
                    });
                },
            });
        },

        reloading_preferences: function(){
            var self = this;
            var params = {
                model: 'customer.preference',
                method: 'search_read',
            }
            return rpc.query(params, {async: false}).then(function(result){
                self.pos.set({'preference_list' : result});
                self.pos.db.preference_by_id = {}
                self.pos.customer_preference = result;
                self.pos.db.add_customer_preference(result)
                self.renderElement();
                self.pos.gui.chrome.screens.clientlist.reload_partners();
            })
        },

         renderElement: function(){
            var self = this;
            self._super();
            var preference_list = self.pos.get('preference_list')
            if(preference_list){
                var contents = this.$el[0].querySelector('.preference-list-contents');
                contents.innerHTML = "";
                var temp = [];
                for(var i = 0, len = Math.min(preference_list.length,1000); i < len; i++){
                    var preference    = preference_list[i];
                    var clientline_html = QWeb.render('preferenceList',{widget: this, preference:preference});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
            }
        },
    });
    gui.define_screen({name:'customer_preferences', widget: CustomerPreferencesWidget});

    var PosReportScreenWidget = screens.ScreenWidget.extend({
        template: 'PosReportScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                self.reloading_orders();
            };
        },

        events: {
            'click .button.back':  'click_back',
            'click .button.promise_today': 'promise_today',
            'click .button.over_due': 'over_due_orders',
            'click .button.late_for_pickup': 'late_for_pickup',
            'click #print_order': 'click_reprint',
            'click .btn-state': 'change_order_state',
            'click #view_lines': 'click_view_lines',
            'click .order-line td:not(.order_operation_button)': 'click_line',
            'click .pay_due_amt': 'pay_order_due',
            'change .delivery_state_id': 'change_order_state',
            'click #select_rack': 'rack_selection',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
        },

        filter:"promise_today",
        click_back: function(){
            this.gui.show_screen('products');
        },
        rack_selection : function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order = self.pos.db.get_order_by_id(Number(order_id));
            if(order_id && order){
                self.gui.show_popup("rack_selection", {order:order})
            }
        },
        free_rack_from_order : function(order){
            var self = this;
            var rack_ids = order.order_rack_id || [];
            if(rack_ids){
                var addOrderPromise = new Promise(function(resolve, reject){
                    var params = {
                        model: 'pos.order.rack',
                        method: "update_all_rack_status",
                        args: [rack_ids],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            self.reloading_racks();
                            resolve(res);
                        }
                    });
                })
                addOrderPromise.then(function(rack){
                    self.reloading_racks();
                })
                var orderPromise = new Promise(function(resolve, reject){
                    var params = {
                        model: 'pos.order',
                        method: "write",
                        args: [[order.id], {'order_rack_id': [[5,]]}],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            resolve(res);
                        }
                    });
                })
                orderPromise.then(function(rack){
                     if(self.filter === 'promise_today'){
                        self.promise_today();
                    }else if(self.filter === 'late_for_pickup'){
                        self.late_for_pickup();
                    }else{
                        self.over_due_orders();
                    }
                }).catch(function(error){
                })
            }

        },

        change_order_state: function(event){
            var self = this;
//            var order_id = event ? parseInt($(event.currentTarget).find(':selected').data('id')) : order_id;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order_state = $(event.currentTarget).val();
            var order = self.pos.db.get_order_by_id(order_id);

            var old_order_state = self.pos.db.get_delivery_state_by_id(Number(order.delivery_state_id[0]));
            var event = $(event.currentTarget)
            var state = self.pos.db.get_delivery_state_by_id([Number(order_state)]);

            if(old_order_state && old_order_state.short_code){
                if(old_order_state.short_code === 'delivered'){
                    alert("You can not change the state of Order Delivered !")
                    self.reloading_orders();
                    return
                }
                if(old_order_state.short_code === state.short_code){
                    self.reloading_orders();
                    return
                }
                if(old_order_state.short_code === "ready_to_deliver" && state.short_code != "ready_to_deliver"){
                    if(order.order_rack_id){
                        self.free_rack_from_order(order);
                    }
                }
                if(state.short_code === "ready_to_deliver" && old_order_state.short_code != "delivered"){
                    self.gui.show_popup("rack_selection", {order:order})
                }

                if(state.short_code != old_order_state.short_code){
                    rpc.query({
                        model: 'pos.order',
                        method: 'write',
                        args: [order_id, {'delivery_state_id': state.id}]
                    },{async: false}).then(function(result) {

                        if(result){
                            if(self.filter == 'promise_today'){
                                self.promise_today();
                            }else if(self.filter == 'late_for_pickup'){
                                self.late_for_pickup();
                            }else{
                                self.over_due_orders();
                            }
                        } else{
                            console.log("No Data To Write");
                        }
                    });
                }else{
                    self.reloading_orders()
                }
            }
        },
        reloading_racks: function(){
            var self = this;
            var OrderPromise = new Promise(function (resolve, reject) {
                 var params = {
                    model: 'pos.order.rack',
                    method: 'search_read',
                    domain: [['config_id', '=', self.pos.config.id]],
                }
                return rpc.query(params, {async: false}).then(function(result){
                    if(result){
                        resolve(result);
                    }
                })
            })
            OrderPromise.then(function(racks){
                self.pos.db.add_rack(racks);
            })
        },
        clear_cart: function(){
            var self = this;
            var order = this.pos.get_order();
            var currentOrderLines = order.get_orderlines();
            if(currentOrderLines && currentOrderLines.length > 0){
                _.each(currentOrderLines,function(item) {
                    order.remove_orderline(item);
                });
            } else {
                return
            }
        },
        pay_order_due: function(event, order_id){
            var self = this;
            var i;
            var order_id = event ? parseInt($(event.currentTarget).data('id')) : order_id;
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(!result){
                new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'pos.order',
                        method: 'search_read',
                        domain: [['id', '=', order_id], ['state', 'not in', ['draft']]],
                    }, {
                        timeout: 3000,
                        shadow: true,
                    })
                    .then(function(order){
                        if(order && order[0]){
                            result = order[0];
                            resolve(result);
                        } else {
                            reject();
                        }
                    }, function (type, err) { reject(); });
                }).then(function(result){
                });
            }
            if(result){
                if(result.state == "paid"){
                    alert("Sorry, This order is paid State");
                    return
                }
                if(result.state == "done"){
                    alert("Sorry, This Order is Done State");
                    return
                }
                if (result && result.lines.length > 0) {
                    self.clear_cart();
                    selectedOrder.set_client(null);
                    if (result.partner_id && result.partner_id[0]) {
                        var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                        if(partner){
                            selectedOrder.set_client(partner);
                        }
                    }
                    selectedOrder.set_name(result.pos_reference);
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_paying_order(true);
                    selectedOrder.set_order_id(result.id);
                    selectedOrder.set_sequence(result.name);
                    selectedOrder.set_order_promise_date(result.promise_date);
                    if(result.lines.length > 0){
                        var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines){
                            if(order_lines.length > 0){
                                _.each(order_lines, function(line){
                                    var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                                    if(product){
                                        selectedOrder.add_product(product, {
                                            quantity: line.qty,
                                            discount: line.discount,
                                            price: line.price_unit,
                                        })
                                    }
                                });
                                var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                                if(prd && result.amount_due > 0){
                                    var paid_amt =Number(result.amount_total) - Number(result.amount_due);
                                    selectedOrder.add_product(prd,{'price':-paid_amt});
                                }
                                self.gui.show_screen('payment');
                            }
                        })
                    }
                }
            }
        },

        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },
        perform_search: function(query){
            var self = this;
            var order_list = self.pos.db.search_order(query);
            var order_list = _.filter(order_list, function(order){
                var promise_date = moment(order.promise_date).format('YYYY-MM-DD HH:mm:ss');
                if(self.filter == 'promise_today'){
                    let s_date= moment('00:00:00', 'HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                    let e_date = moment('23:59:59', 'HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                    if(promise_date >= s_date && promise_date <= e_date && !_.contains(['ready_to_deliver', 'delivered'], order.delivery_state_Short_code)){
                        if(!(order.is_adjustment || order.is_membership_order || order.is_previous_order)){
                            return order
                        }
                    }
                }else if(self.filter == 'late_for_pickup'){
                    let days =  self.pos.config.overdue_order_days ?  self.pos.config.late_pickup_order_days : 15;
                    let s_date = moment('23:59:59', 'HH:mm:ss').subtract('days', days).format('YYYY-MM-DD HH:mm:ss');
                    if(promise_date <= s_date && (order.delivery_state_Short_code == 'ready_to_deliver')){
                        if(!(order.is_adjustment || order.is_membership_order || order.is_previous_order)){
                            return order
                        }
                    }
                }else{
                    var days =  self.pos.config.overdue_order_days ?  self.pos.config.overdue_order_days : 15;
                    var s_date = moment('00:00:00', 'HH:mm:ss').subtract('days', days).format('YYYY-MM-DD HH:mm:ss');
                    var e_date= moment().subtract('days', 1).format('YYYY-MM-DD 23:59:59');
                    if(promise_date >= s_date && promise_date <= e_date && !_.contains(['ready_to_deliver', 'delivered'], order.delivery_state_Short_code)){
                        if(!(order.is_adjustment || order.is_membership_order || order.is_previous_order)){
                            return order
                        }
                    }
                }
            })
            self.render_list(order_list);
        },
        clear_search: function(){
            if(this.filter == 'promise_today'){
                this.promise_today();
            }else if(this.filter == 'late_for_pickup'){
                this.late_for_pickup();
            }else{
                this.over_due_orders();
            }
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },

        click_line: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).parent().data('id'));
            self.gui.show_screen('orderdetail', {'order_id': order_id});
        },
        get_journal_from_order: function(statement_ids){
            var self = this;
            var order = this.pos.get_order();
            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'account.bank.statement.line',
                    method: 'search_read',
                    domain: [['id', 'in', statement_ids]],
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function(statements){
                    if(statements.length > 0){
                        var order_statements = []
                        _.each(statements, function(statement){
                            if(statement.amount > 0){
                                order_statements.push({
                                    amount: statement.amount,
                                    journal: statement.journal_id[1],
                                })
                            }
                        });
                        order.set_journal(order_statements);
                        resolve();
                    } else {
                        reject();
                    }
                }, function (type, err) { reject(); });
            });
        },
        click_reprint: function(event){
            var self = this;
            var selectedOrder = this.pos.get_order();
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order_uid = parseInt($(event.currentTarget).data('uid'));
            selectedOrder.set_client(null);
            var result = self.pos.db.get_order_by_id(order_id);
            if (result && result.lines.length > 0) {
                if (result.partner_id && result.partner_id[0]) {
                    var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                    if(partner){
                        selectedOrder.set_client(partner);
                    }
                }
                selectedOrder.set_name(result.pos_reference);
                selectedOrder.set_order_promise_date(result.promise_date);
                selectedOrder.set_amount_paid(result.amount_paid);
                selectedOrder.set_amount_return(Math.abs(result.amount_return));
                selectedOrder.set_amount_tax(result.amount_tax);
                selectedOrder.set_amount_total(result.amount_total);
                selectedOrder.set_company_id(result.company_id[1]);
                selectedOrder.set_date_order(result.date_order);
                selectedOrder.set_client(partner);
                selectedOrder.set_pos_reference(result.pos_reference);
                selectedOrder.set_user_name(result.user_id && result.user_id[1]);
                selectedOrder.set_order_promise_date(result.promise_date);
                if(result.payment_ids.length > 0){
                    self.get_journal_from_order(result.payment_ids);
                }
                if(result.lines.length > 0){
                    self.get_orderlines_from_order(result.lines).then(function(order_lines){
                        var order_lines = _.each(order_lines, function(line){
                            var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                            if(product){
                                selectedOrder.add_product(product, {
                                    quantity: line.qty,
                                    discount: line.discount,
                                    price: line.price_unit,
                                })
                            }
                        });
                        var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                        if(prd && result.amount_due > 0){
                            var paid_amt = result.amount_total - result.amount_due;
                            selectedOrder.add_product(prd,{'price':-paid_amt});
                        }
                        self.gui.show_screen('receipt');
                    });
                }
            }
        },
        promise_today: function(event){
            var self = this;
            var s_date= moment('00:00:00', 'HH:mm:ss').utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');
            var e_date = moment('23:59:59', 'HH:mm:ss').utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');

            self.domain = [['promise_date', '>=', s_date], ['promise_date', '<=', e_date],
                            ['delivery_state_Short_code', 'not in', ['ready_to_deliver', 'delivered']]];
            if(event){
                if($(event.currentTarget).hasClass('selected')){
                    $(event.currentTarget).removeClass('selected');
                }else{
                    self.$('.button.over_due').removeClass('selected');
                    self.$('.button.late_for_pickup').removeClass('selected');
                    $(event.currentTarget).addClass('selected');
                }
            }else{
                self.$('.button.over_due').removeClass('selected');
                self.$('.button.late_for_pickup').removeClass('selected');
                self.$('.button.promise_today').addClass('selected');
            }
            self.filter = 'promise_today'
            self.reloading_orders();
        },
        over_due_orders: function(event){
            var self = this;
            var days =  self.pos.config.overdue_order_days ?  self.pos.config.overdue_order_days : 15;
            var s_date = moment('00:00:00', 'HH:mm:ss').subtract('days', days).utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');
            var e_date= moment().subtract('days', 1).utcOffset(0, false).format('YYYY-MM-DD 23:59:59');
            self.filter = 'over_due_order';
            if(event){
                if($(event.currentTarget).hasClass('selected')){
                    $(event.currentTarget).removeClass('selected');
                }else{
                    self.$('.button.late_for_pickup').removeClass('selected');
                    self.$('.button.promise_today').removeClass('selected');
                    $(event.currentTarget).addClass('selected');
                }
            }else{
                self.$('.button.over_due').addClass('selected');
                self.$('.button.late_for_pickup').removeClass('selected');
                self.$('.button.promise_today').removeClass('selected');
            }
            self.domain = [
                            ['promise_date', '>=', s_date], ['promise_date', '<=', e_date],
                            ['order_rack_id', '=', false],
                            ['delivery_state_Short_code', 'not in', ['ready_to_deliver', 'delivered']]
                          ];
            self.reloading_orders();
        },
        late_for_pickup: function(event){
            var self = this;
            var days =  self.pos.config.overdue_order_days ?  self.pos.config.late_pickup_order_days : 15;
            var s_date = moment('23:59:59', 'HH:mm:ss').subtract('days', days).utcOffset(0, false).format('YYYY-MM-DD HH:mm:ss');

            if(event){
                if($(event.currentTarget).hasClass('selected')){
                    $(event.currentTarget).removeClass('selected');
                }else{
                    self.$('.button.promise_today').removeClass('selected');
                    self.$('.button.over_due').removeClass('selected');
                    $(event.currentTarget).addClass('selected');
                    $(event.currentTarget).addClass('selected');
                }
            }else{
                self.$('.button.late_for_pickup').addClass('selected');
                self.$('.button.over_due').removeClass('selected');
                self.$('.button.promise_today').removeClass('selected');
            }
            self.filter = 'late_for_pickup';
            self.domain = [['promise_date', '<=', s_date], ['delivery_state_Short_code', '=', 'ready_to_deliver']];
            self.reloading_orders();
        },
        show: function(){
            var self = this;
            this._super();
            self.reload_orders();
        },
        reload_orders : function(){
            this.render_list(this.pos.get('pos_report_order_list'));
        },

        render_list: function(orders){
            var self = this;
            $('.order-count').text(orders ? orders.length : 0)
            if(orders){
                var contents = this.$el[0].querySelector('.pos-report-list-contents');
                contents.innerHTML = "";
                this.from = 'report'
                this.order_count = 0;
                for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
                    var order    = orders[i];
                    order.amount_total = parseFloat(order.amount_total).toFixed(2);
                    var order_state = self.pos.db.get_delivery_state_by_id(order.delivery_state_id[0])
                    this.order_count = order.length
                    var clientline_html = QWeb.render('OrderlistLine',{widget: this, order:order, state:self.pos.delivery_state, order_state:order_state});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
            }else{
                $('.pos-report-list-contents').innerHTML = "";
            }
        },

        click_view_lines: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(result.lines.length > 0){
                var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines){
                    if(order_lines){
                        self.gui.show_popup('product_popup', {
                            order_lines: order_lines,
                            order_id: order_id,
                            state: result.state,
                            order_screen_obj: self,
                        });
                    }
                })
            }
        },
        get_orderlines_from_order: function(line_ids){
            var self = this;
            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'pos.order.line',
                    method: 'search_read',
                    domain: [['id', 'in', line_ids]],
                })
                .then(function (order_lines) {
                    if (order_lines.length > 0) {
                        resolve(order_lines);
                    } else {
                        reject();
                    }
                }, function (type, err) { reject(); });
            });
        },

        reloading_orders: function(){
            var self = this;
            if(self.domain){
                self.domain.push(
                                    ['is_membership_order','=',false],
                                    ['is_adjustment','=',false],
                                    ['is_previous_order','=',false],
                                    ['session_id', 'in', self.pos.session_ids]
                                )
            }else{
                self.domain = [ ['is_membership_order','=',false],
                                    ['is_adjustment','=',false],
                                    ['is_previous_order','=',false],
                                    ['session_id', 'in', self.pos.session_ids]];
            }
            var OrderPromise = new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: self.domain,
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function(orders){
                    if(orders.length > 0){
                        self.pos.db.add_orders(orders);
                        self.pos.set({'pos_order_list' : orders});
                        resolve(orders);
                    }else{
                        $('.pos-report-list-contents').innerHTML = "";
                        self.render_list([]);
                        reject();
                    }
                })
             })
            OrderPromise.then(function(orders){
                self.render_list(orders);
            })
        },
        renderElement: function(){
            var self = this;
            self._super();
            self.el.querySelector('.button.reload').addEventListener('click',this.reload_btn);
        },
    });
    gui.define_screen({name:'posreportscreen', widget: PosReportScreenWidget});
/******************************************* Adjustment **********************************************/
    var CustomerAdjustmentButton = screens.ActionButtonWidget.extend({
        template: 'CustomerAdjustmentButton',
        button_click: function(){
            this.gui.show_screen('customeradjustmentlistscreen');
        },
    });

    screens.define_action_button({
        'name': 'CustomerAdjustmentButton',
        'widget': CustomerAdjustmentButton,
         'condition': function(){
            return this.pos.config.enable_customer_adjustment && this.pos.user.enable_adjustment;
        },
    });

    var CustomerAdjustmentlistScreen = screens.ScreenWidget.extend({
        template: 'CustomerAdjustmentlistScreen',
        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                self.reloading_adjustment();
            };

        },
        show: function(){
            var self = this;
            this._super();
            this.reload_adjustment();
        },
        events: {
            'click .button.back':  'click_back',
            'click .button.create': 'create_adjustment',
            'click .button.minus': 'create_adjustment',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
        },
        clear_search: function(){
            this.render_list(this.reload_adjustment());
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                var customer_adjustments = self.pos.db.search_adjustment(query);
                if ( associate_result && customer_adjustments.length === 1){
                    this.gui.back();
                }
                this.render_list(customer_adjustments);
            }else{
                this.render_list(self.reloading_adjustment());
            }
        },
        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },

        click_back: function(){
            this.gui.back();
        },
        create_adjustment:function(event){
            var flag = false;
            if($(event.currentTarget).data('id') === 'plus'){
                flag = true;
            }
            this.pos.gui.show_popup('create_cust_adjustment_popup',{reason: this.pos.adjustment_reason, flag:flag});
        },
        reload_adjustment: function(){
            var self = this;
            var adjustments = self.pos.get('adjustment_list');
            this.render_list(adjustments);
        },
        render_list: function(orders){
            var self = this;
            if(orders){
                var contents = this.$el[0].querySelector('.adjustment-list-contents');
                contents.innerHTML = "";
                for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
                    var order    = orders[i];
                    var clientline_html = QWeb.render('AdjustmentlistLine',{widget: this, order:order});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
                setTimeout(function(){
                    $('#customer-adjustment').paging({limit:15});
                },200)
            }
        },
        reloading_adjustment: function(){
            var self = this;
            var OrderPromise = new Promise(function (resolve, reject) {
                 var params = {
                    model: 'customer.adjustment',
                    method: 'search_read',
                }
                return rpc.query(params, {async: false}).then(function(result){
                    if(result){
                        resolve(result);
                    }
                })
            })
            OrderPromise.then(function(adjustment_list){
                self.pos.set('adjustment_list', adjustment_list)
                self.reload_adjustment();
            })
        },
        renderElement: function(){
            var self = this;
            self._super();
            self.el.querySelector('.button.reload').addEventListener('click',this.reload_btn);

        },
    });
    gui.define_screen({name:'customeradjustmentlistscreen', widget: CustomerAdjustmentlistScreen});
/************************************************* Previous Order *********************************/
  var CustomerPreviousButton = screens.ActionButtonWidget.extend({
        template: 'CustomerPreviousButton',
        button_click: function(){
this.pos.gui.show_popup('create_prev_popup',{});
              },
    });

    screens.define_action_button({
        'name': 'CustomerPreviousButton',
        'widget': CustomerPreviousButton,
         'condition': function(){
            return this.pos.config.enable_customer_previous ;
        },
    });




/************************************************** Previous order ********************************/

    var MembershipCardListScreenWidget = screens.ScreenWidget.extend({
        template: 'MembershipCardListScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                self.reloading_membership_cards();
            };
            if(this.pos.config.iface_vkeyboard && self.chrome.widget.keyboard){
                self.chrome.widget.keyboard.connect(this.$('.searchbox input'));
            }
        },

        events: {
            'click .button.back':  'click_back',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
            'click .button.create':  'click_create',
            'click .button.reload': 'reload_btn',
            'click #recharge_membership_card': 'click_recharge',
            'click #edit_membership_card': 'click_edit_membership_card',
//            'click #exchange_membership_card': 'click_exchange',
        },

        filter:"all",
        date: "all",

        click_back: function(){
            this.gui.back();
        },

        click_create: function(event){
            this.gui.show_popup('create_membership_card_popup');
        },

        click_recharge: function(event){
            var self = this;
            var card_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_membership_card_by_id(card_id);
            var order = self.pos.get_order();
            var client = order.get_client();
            if (!result){
                        self.pos.gui.chrome.screens.membershipcardlistscreen.reloading_membership_cards().then(
                                                                        function(){
                                                                                    var result = self.pos.db.get_membership_card_by_id(card_id);
                                                                         self.gui.show_popup('recharge_membership_card_popup',{
                'card_id':result.id,
                'card_no':result.card_no,
                'card_value':result.card_value,
                'customer_id':result.customer_id
            });
                                                                        });
            }else
            self.gui.show_popup('recharge_membership_card_popup',{
                'card_id':result.id,
                'card_no':result.card_no,
                'card_value':result.card_value,
                'customer_id':result.customer_id
            });
        },


        click_edit_membership_card: function(event){
            var self  = this;
            var card_id = parseInt($(event.currentTarget).data('id'));
            var result = self.pos.db.get_membership_card_by_id(card_id);
            console.log("result>>>>>>>>>>>", result)
            if (result) {
                self.gui.show_popup('edit_membership_card_popup',{'card_id':card_id,
                                                                  'card_no':result.card_no,
                                                                  'expire_date':result.expire_date});
            }
        },

        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },

        get_membership_cards: function(){
            return this.pos.get('membership_card_order_list');
        },

        show: function(){
            var self = this;
            this._super();
            this.reloading_membership_cards();
            this.reload_membership_cards();
            $('.issue_date_filter').datepicker({
                dateFormat: 'dd/mm/yy',
                autoclose: true,
                changeMonth: true,
                changeYear: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.date = moment(date, 'DD/MM/YYYY').format('YYYY-MM-DD');
                        self.render_list(self.get_membership_cards());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.date = "all";
                        self.render_list(self.get_membership_cards());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.date = "all";
                    self.render_list(self.get_membership_cards());
                });
           });
           $('.expiry_date_filter').datepicker({
                dateFormat: 'dd/mm/yy',
                autoclose: true,
                changeMonth: true,
                changeYear: true,
                closeText: 'Clear',
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.expire_date = moment(date, 'DD/MM/YYYY').format('YYYY-MM-DD');
                        self.render_list(self.get_membership_cards());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.expire_date = "all";
                        self.render_list(self.get_membership_cards());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.expire_date = "all";
                    self.render_list(self.get_membership_cards());
                });
           });
        },

        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                var membership_cards = self.pos.db.search_membership_card(query);
                if ( associate_result && membership_cards.length === 1){
                    this.gui.back();
                }
                this.render_list(membership_cards);
            }else{
                this.render_list(self.get_membership_cards());
            }
        },

        clear_search: function(){
            this.render_list(this.get_membership_cards());
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },

        render_list: function(membership_cards){
            var self = this;
            var contents = this.$el[0].querySelector('.membership-card-list-contents');
            contents.innerHTML = "";
            var temp = [];
            if(self.filter !== "" && self.filter !== "all"){
                membership_cards = $.grep(membership_cards,function(membership_card){
                    return membership_card.state === self.filter;
                });
            }
            if(self.date !== "" && self.date !== "all"){
                var x = [];
                for (var i=0; i<membership_cards.length;i++){
                    var date_expiry = membership_cards[i].expire_date;
                    var date_issue = membership_cards[i].issue_date;
                    if(self.date == date_issue){
                        x.push(membership_cards[i]);
                    }
                }
                membership_cards = x;
            }
            if(self.expire_date !== "" && self.expire_date !== "all"){
                var y = [];
                for (var i=0; i<membership_cards.length;i++){
                    var date_expiry = membership_cards[i].expire_date;
                    var date_issue = membership_cards[i].issue_date;
                    if(self.expire_date == date_expiry){
                        y.push(membership_cards[i]);
                    }
                }
                membership_cards = y;
            }
            for(var i = 0, len = Math.min(membership_cards.length,1000); i < len; i++){
                var membership_card    = membership_cards[i];
                membership_card.amount = parseFloat(membership_card.amount).toFixed(2);
                var clientline_html = QWeb.render('MembershipCardlistLine',{widget: this, membership_card:membership_card});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                contents.appendChild(clientline);
            }
            setTimeout(function(){
                $('.membership-card-list').paging({limit:15});
            },100)
        },

        reload_membership_cards: function(){
//        console.log(" reload_membership_cards refreshing rendered list")
            var self = this;
            this.render_list(self.get_membership_cards());
        },

        reloading_membership_cards: function(){
//        console.log("  reloading_membership_cards : set values to  self.pos.set({'membership_card_order_list' : result});")
            var self = this;
            var params = {
                model: 'membership.card',
                method: 'search_read',
                domain: [['is_active', '=', true]],
            }
            return rpc.query(params, {async: false}).then(function(result){
                self.pos.db.add_membership_card(result);
                self.pos.set({'membership_card_order_list' : result});
                self.date = 'all';
                self.expire_date = 'all';
                self.reload_membership_cards();
                return self.pos.get('membership_card_order_list');
            })
        },
    });
    gui.define_screen({name:'membershipcardlistscreen', widget: MembershipCardListScreenWidget});
    //Membership Card Code End

    var ShowOrderList = screens.ActionButtonWidget.extend({
        template : 'ShowOrderList',
        button_click : function() {
            self = this;
            self.gui.show_screen('orderlist');
        },
    });

    screens.define_action_button({
        'name' : 'showorderlist',
        'widget' : ShowOrderList,
        'condition': function(){
	        return this.pos.config.enable_order_screen && this.pos.user.allow_order_screen;
	    },
    });

    var SaveDraftButton = screens.ActionButtonWidget.extend({
        template : 'SaveDraftButton',
        button_click : function() {
            var self = this;
            var selectedOrder = this.pos.get_order();
            selectedOrder.initialize_validation_date();
            var currentOrderLines = selectedOrder.get_orderlines();
            var orderLines = [];
            var client = selectedOrder.get_client();
            _.each(currentOrderLines,function(item) {
                return orderLines.push(item.export_as_JSON());
            });
            if(!client){
                return alert ('Please Select Customer !');
            }
            else if (orderLines.length === 0) {
                return alert ('Please Select product !');
            } else {
                if( this.pos.config.require_customer && !selectedOrder.get_client()){
                    self.gui.show_popup('error',{
                        message: _t('An anonymous order cannot be confirmed'),
                        comment: _t('Please select a client for this order. This can be done by clicking the order tab')
                    });
                    return;
                }
                var credit = selectedOrder.get_total_with_tax() - selectedOrder.get_total_paid();
                if (client && client.remaining_credit_limit > credit){
                    self.gui.show_popup('max_limit',{
                        remaining_credit_limit: client.remaining_credit_limit,
                        draft_order: true,
                    });
                }else{
                    alert("Please verify the Credit Limit for the Selected Client.");
                }
            }
        },
    });

    screens.define_action_button({
        'name' : 'savedraftbutton',
        'widget' : SaveDraftButton,
        'condition': function(){
            return this.pos.config.enable_partial_payment;
        },
    });

    /* Order list screen */
    var OrderListScreenWidget = screens.ScreenWidget.extend({
        template: 'OrderListScreenWidget',

        init: function(parent, options){
            var self = this;
            this._super(parent, options);
            this.reload_btn = function(){
                $('.fa-refresh').toggleClass('rotate', 'rotate-reset');
                if($('#select_draft_orders').prop('checked')){
                    $('#select_draft_orders').click();
                }
                self.reloading_orders();
            };
            if(this.pos.config.iface_vkeyboard && self.chrome.widget.keyboard){
                self.chrome.widget.keyboard.connect(this.$('.searchbox input'));
            }
        },
        events: {
            'click .button.back':  'click_back',
            'click .button.draft':  'click_draft',
            'click .button.paid': 'click_paid',
            'click .button.posted': 'click_posted',
            'click #print_order': 'click_reprint',
            'click #edit_order': 'click_edit_or_duplicate_order',
            'click #re_order_duplicate': 'click_edit_or_duplicate_order',
            'click #select_rack': 'rack_selection',
            'click #view_lines': 'click_view_lines',
            'click .pay_due_amt': 'pay_order_due',
            'keyup .searchbox input': 'search_order',
            'click .searchbox .search-clear': 'clear_search',
            'click .order-line td:not(.order_operation_button)': 'click_line',
            'change .delivery_state_id': 'change_order_state',
            'click .btn-state': 'change_order_state',
        },
        filter:"all",
        date: "all",
        get_orders: function(){
            return this.pos.get('pos_order_list');
        },
        click_back: function(){
            this.gui.show_screen('products');
        },
        click_draft: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.paid').removeClass('selected');
                self.$('.button.posted').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "draft";
            }
            self.render_list(self.get_orders());
        },
        click_paid: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.draft').removeClass('selected');
                self.$('.button.posted').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "paid";
            }
            self.render_list(self.get_orders());
        },
        click_posted: function(event){
            var self = this;
            if($(event.currentTarget).hasClass('selected')){
                $(event.currentTarget).removeClass('selected');
                self.filter = "all";
            }else{
                self.$('.button.paid').removeClass('selected');
                self.$('.button.draft').removeClass('selected');
                $(event.currentTarget).addClass('selected');
                self.filter = "all";
            }
            self.render_list(self.get_orders());
        },
        clear_cart: function(){
            var self = this;
            var order = this.pos.get_order();
            var currentOrderLines = order.get_orderlines();
            if(currentOrderLines && currentOrderLines.length > 0){
                _.each(currentOrderLines,function(item) {
                    order.remove_orderline(item);
                });
            } else {
                return
            }
        },
        get_journal_from_order: function(statement_ids){
            var self = this;
            var order = this.pos.get_order();
            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'account.bank.statement.line',
                    method: 'search_read',
                    domain: [['id', 'in', statement_ids]],
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function(statements){
                    if(statements.length > 0){
                        var order_statements = []
                        _.each(statements, function(statement){
                            if(statement.amount > 0){
                                order_statements.push({
                                    amount: statement.amount,
                                    journal: statement.journal_id[1],
                                })
                            }
                        });
                        order.set_journal(order_statements);
                        resolve();
                    } else {
                        reject();
                    }
                }, function (type, err) { reject(); });
            });
        },
        get_orderlines_from_order: function(line_ids){
            var self = this;
            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'pos.order.line',
                    method: 'search_read',
                    domain: [['id', 'in', line_ids]],
                })
                .then(function (order_lines) {
                    if (order_lines.length > 0) {
                        resolve(order_lines);
//                        return order_lines
                    } else {
                        reject();
                    }
                }, function (type, err) { reject(); });
            });
        },
        click_reprint: function(event){
            var self = this;
            var selectedOrder = this.pos.get_order();
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order_uid = parseInt($(event.currentTarget).data('uid'));
            self.clear_cart();
            selectedOrder.set_client(null);
            var result = self.pos.db.get_order_by_id(order_id);
            if (result && result.lines.length > 0) {
                if (result.partner_id && result.partner_id[0]) {
                    var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                    if(partner){
                        selectedOrder.set_client(partner);
                    }
                }
                selectedOrder.set_name(result.pos_reference);
                selectedOrder.set_order_promise_date(result.promise_date);
                selectedOrder.set_amount_paid(result.amount_paid);
                selectedOrder.set_amount_return(Math.abs(result.amount_return));
                selectedOrder.set_amount_tax(result.amount_tax);
                selectedOrder.set_amount_total(result.amount_total);
                selectedOrder.set_company_id(result.company_id[1]);
                selectedOrder.set_date_order(result.date_order);
                selectedOrder.set_client(partner);
                selectedOrder.set_pos_reference(result.pos_reference);
                selectedOrder.set_user_name(result.user_id && result.user_id[1]);
                selectedOrder.set_date_order(result.date_order);
                if(result.payment_ids.length > 0){
                    self.get_journal_from_order(result.payment_ids);
                }
                if(result.lines.length > 0){
                    self.get_orderlines_from_order(result.lines).then(function(order_lines){
                        var order_lines = _.each(order_lines, function(line){
                            var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                            if(product){
                                selectedOrder.add_product(product, {
                                    quantity: line.qty,
                                    discount: line.discount,
                                    price: line.price_unit,
                                })
                            }
                        });
                        var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                        if(prd && result.amount_due > 0){
                            var paid_amt = result.amount_total - result.amount_due;
                            selectedOrder.add_product(prd,{'price':-paid_amt});
                        }
                        self.gui.show_screen('receipt');
                    });
                }
            }
        },
        click_view_lines: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(result.lines.length > 0){
                var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines){
                    if(order_lines){
                        self.gui.show_popup('product_popup', {
                            order_lines: order_lines,
                            order_id: order_id,
                            state: result.state,
                            order_screen_obj: self,
                        });
                    }
                })
            }
        },
        state_receive: function(event){
          var self = this;
          var order_id = parseInt($(event.currentTarget).data('id'));
          var order = self.pos.db.get_order_by_id(order_id);
          Array.from($( "select[data-id="+parseInt($(event.currentTarget).data('id'))+"]")[0].options).forEach(function(option_element) {
            if (option_element.getAttribute('data-code') === 'receive') {
                option_element.selected = true;
//                alert("true");
            } else {
                option_element.selected = false;
                }
            });
          alert("state_receive");
        },
        state_in_progress: function(event){
         alert("in_progress");
        },
        state_ready_to_deliver: function(event){
         alert("ready_to_deliver");
        },
        state_pickup_by_driver: function(event){
         alert("pickup_by_driver");
        },
        state_delivered: function(event){
         alert("delivered");
        },
        click_edit_or_duplicate_order: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(result.lines.length > 0){
                if($(event.currentTarget).data('operation') === "edit"){
                    if(result.state == "paid"){
                        alert("Sorry, This order is paid State");
                        return
                    }
                    if(result.state == "done"){
                        alert("Sorry, This Order is Done State");
                        return
                    }
                }
                self.clear_cart();
                selectedOrder.set_client(null);
                if (result.partner_id && result.partner_id[0]) {
                    var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                    if(partner){
                        selectedOrder.set_client(partner);
                    }
                }
                if($(event.currentTarget).data('operation') !== _t("reorder")){
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_order_id(order_id);
                    selectedOrder.set_sequence(result.name);
                }
                if(result.lines.length > 0){
                    var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines){
                        if(order_lines.length > 0){
                            _.each(order_lines, function(line){
                                var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                                if(product){
                                    selectedOrder.add_product(product, {
                                        quantity: line.qty,
                                        discount: line.discount,
                                        price: line.price_unit,
                                    })
                                }
                            })
                        }
                    })
                }
                self.gui.show_screen('products');
            }
        },
        click_line: function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).parent().data('id'));
            self.gui.show_screen('orderdetail', {'order_id': order_id});
        },
        rack_selection : function(event){
            var self = this;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order = self.pos.db.get_order_by_id(order_id);
            if(order_id && order){
                self.gui.show_popup("rack_selection", {order:order})
            }
        },
        free_rack_from_order : function(order){
            var self = this;
            var rack_ids = order.order_rack_id || [];
            if(rack_ids){
                var addOrderPromise = new Promise(function(resolve, reject){
                    var params = {
                        model: 'pos.order.rack',
                        method: 'update_all_rack_status',
                        args: [rack_ids],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            self.reloading_racks();
                            //resolvprint_ordere(res);
                        }
                    });
                })
                addOrderPromise.then(function(rack){
                    self.reloading_racks();
                })
                var orderPromise = new Promise(function(resolve, reject){
                    var params = {
                        model: 'pos.order',
                        method: "write",
                        args: [[order.id], {'order_rack_id': [[5,]]}],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            resolve(res);
                        }
                    });
                })
                orderPromise.then(function(rack){
                     self.reloading_orders();
                })
            }
        },
        change_order_state: function(event){
            var self = this;
//            var order_id = event ? parseInt($(event.currentTarget).find(':selected').data('id')) : order_id;
            var order_id = parseInt($(event.currentTarget).data('id'));
            var order_state = $(event.currentTarget).val();
            var order = self.pos.db.get_order_by_id(order_id);
            var old_order_state = self.pos.db.get_delivery_state_by_id(Number(order.delivery_state_id[0]||order.delivery_state_id));
            var event = $(event.currentTarget)
            var state = self.pos.db.get_delivery_state_by_id([Number(order_state)]);

            if(old_order_state && old_order_state.short_code){
                if(old_order_state.short_code === 'delivered'){
                    alert("You can not change the state of Order Delivered !")
                    self.reloading_orders();
                    return
                }
                if(old_order_state.short_code === state.short_code){
                    self.reloading_orders();
                    return
                }
                if(old_order_state.short_code === "ready_to_deliver" && state.short_code != "ready_to_deliver"){
                    if(order.order_rack_id){
                        self.free_rack_from_order(order);
                    }
                }
                if(state.short_code === "ready_to_deliver" && old_order_state.short_code != "delivered"){
                    self.gui.show_popup("rack_selection", {order:order})
                }
                if(state.short_code != old_order_state.short_code){
                    rpc.query({
                        model: 'pos.order',
                        method: 'write',
                        args: [order_id, {'delivery_state_id': state.id}]
                    },{async: false}).then(function(result) {
                        if(result){
                            self.reloading_orders()
                        }
                    });
                }else{
                    self.reloading_orders()
                }
            }
        },

        pay_order_due: function(event, order_id){
            var self = this;
            var i;
            var order_id = event ? parseInt($(event.currentTarget).data('id')) : order_id;
            var selectedOrder = this.pos.get_order();
            var result = self.pos.db.get_order_by_id(order_id);
            if(!result){
                new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'pos.order',
                        method: 'search_read',
                        domain: [['id', '=', order_id], ['state', 'not in', ['draft']]],
                    }, {
                        timeout: 3000,
                        shadow: true,
                    })
                    .then(function(order){
                        if(order && order[0]){
                            result = order[0];
                            resolve(result);
                        } else {
                            reject();
                        }
                    }, function (type, err) { reject(); });
                }).then(function(result){
                });
            }
            if(result){
                if(result.state == "paid"){
                    alert("Sorry, This order is paid State");
                    return
                }
                if(result.state == "done"){
                    alert("Sorry, This Order is Done State");
                    return
                }
                if (result && result.lines.length > 0) {
                    self.clear_cart();
                    selectedOrder.set_client(null);
                    if (result.partner_id && result.partner_id[0]) {
                        var partner = self.pos.db.get_partner_by_id(result.partner_id[0])
                        if(partner){
                            selectedOrder.set_client(partner);
                        }
                    }
                    selectedOrder.set_name(result.pos_reference);
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_paying_order(true);
                    selectedOrder.set_order_id(result.id);
                    selectedOrder.set_sequence(result.name);
                    selectedOrder.set_order_promise_date(result.promise_date);
                    if(result.lines.length > 0){
                        var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines){
                            if(order_lines.length > 0){
                                _.each(order_lines, function(line){
                                    var product = self.pos.db.get_product_by_id(Number(line.product_id[0]));
                                    if(product){
                                        selectedOrder.add_product(product, {
                                            quantity: line.qty,
                                            discount: line.discount,
                                            price: line.price_unit,
                                        })
                                    }
                                });
                                var prd = self.pos.db.get_product_by_id(self.pos.config.prod_for_payment[0]);
                                if(prd && result.amount_due > 0){
                                    var paid_amt =Number(result.amount_total) - Number(result.amount_due);
                                    selectedOrder.add_product(prd,{'price':-paid_amt});
                                }
                                self.gui.show_screen('payment');
                            }
                        })
                    }
                }
            }
        },
        show: function(){
            var self = this;
            this._super();
            if($('#select_draft_orders').prop('checked')){
                $('#select_draft_orders').click();
            }
            this.reload_orders();
            $('input#datepicker').datepicker({
                dateFormat: 'dd/mm/yy',
                autoclose: true,
                closeText: 'Clear',
                changeMonth: true,
                changeYear: true,
                showButtonPanel: true,
                onSelect: function (dateText, inst) {
                    var date = $(this).val();
                    if (date){
                        self.date = date;
                        self.render_list(self.get_orders());
                    }
                },
                onClose: function(dateText, inst){
                    if( !dateText ){
                        self.date = "all";
                        self.render_list(self.get_orders());
                    }
                }
           }).focus(function(){
                var thisCalendar = $(this);
                $('.ui-datepicker-close').click(function() {
                    thisCalendar.val('');
                    self.date = "all";
                    self.render_list(self.get_orders());
                });
           });
        },
        search_order: function(event){
            var self = this;
            var search_timeout = null;
            clearTimeout(search_timeout);
            var query = $(event.currentTarget).val();
            search_timeout = setTimeout(function(){
                self.perform_search(query,event.which === 13);
            },70);
        },
        perform_search: function(query, associate_result){
            var self = this;
            if(query){
                if (associate_result){
                    var domain = ['|', '|',['partner_id', 'ilike', query], ['name', 'ilike', query], ['pos_reference', 'ilike', query],['is_membership_order','=',false],['is_previous_order','=',false],['is_adjustment','=',false]];
                    return new Promise(function (resolve, reject) {
                        rpc.query({
                            model: 'pos.order',
                            method: 'search_read',
                            domain: domain,
                        }, {
                            timeout: 3000,
                            shadow: true,
                        })
                        .then(function(orders){
                            if(orders){
                                self.render_list(orders);
                                resolve();
                            } else {
                                reject();
                            }
                        }, function (type, err) { reject(); });
                    });
                } else {
                    var orders = this.pos.db.search_order(query);
                    self.render_list(orders);
                }
            }else{
                var orders = self.pos.get('pos_order_list');
                this.render_list(orders);
            }
        },
        clear_search: function(){
            var orders = this.pos.get('pos_order_list');
            this.render_list(orders);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        check_filters: function(orders){
            var self = this;
            var filtered_orders = false;
            if(self.filter !== "" && self.filter !== "all"){
                if (self.filter === 'paid'){
                    filtered_orders = $.grep(orders,function(order){
                        return order.state === self.filter || order.state === 'done' ;
                    });
                }
                else{
                    filtered_orders = $.grep(orders,function(order){
                        return order.state === self.filter;
                    });
                }
            }
            return filtered_orders || orders;
        },
        check_date_filter: function(orders){
            var self = this;
            var date_filtered_orders = [];
            if(self.date !== "" && self.date !== "all"){
                for (var i=0; i<orders.length;i++){
                    var date_order = $.datepicker.formatDate("dd/mm/yy",new Date(orders[i].date_order));
                    console.log(self.date, date_order)
                    if(self.date === date_order){
                        date_filtered_orders.push(orders[i]);
                    }
                }
            }
            return date_filtered_orders;
        },
        render_list: function(orders){
            var self = this;
            if(orders){
                var contents = this.$el[0].querySelector('.order-list-contents');
                contents.innerHTML = "";
                var temp = [];
                orders = self.check_filters(orders);
                if(self.date !== "" && self.date !== "all"){
                    orders = self.check_date_filter(orders);
                }
                for(var i = 0, len = Math.min(orders.length,1000); i < len; i++){
                    var order    = orders[i];

                    order.amount_total = parseFloat(order.amount_total).toFixed(2);
                    var order_state = self.pos.db.get_delivery_state_by_id(order.delivery_state_id[0]);
                    var clientline_html = QWeb.render('OrderlistLine',{widget: this, order:order, state:self.pos.delivery_state, order_state:order_state});
                    var clientline = document.createElement('tbody');
                    clientline.innerHTML = clientline_html;
                    clientline = clientline.childNodes[1];
                    contents.appendChild(clientline);
                }
                $("table.order-list").simplePagination({
                    previousButtonClass: "btn btn-danger",
                    nextButtonClass: "btn btn-danger",
                    previousButtonText: '<i class="fa fa-angle-left fa-lg"></i>',
                    nextButtonText: '<i class="fa fa-angle-right fa-lg"></i>',
                    perPage:self.pos.config.record_per_page > 0 ? self.pos.config.record_per_page : 5
                });
            }
        },
        reload_orders: function(){
            var self = this;
            var orders = self.pos.get('pos_order_list');
            orders=orders.filter(function(order){
return (!(order.is_adjustment || order.is_membership_order || order.is_previous_order))  });
                self.pos.set({'pos_order_list' : orders});
            this.search_list = [];
            _.each(self.pos.partners, function(partner){
                self.search_list.push(partner.name);
            });
            _.each(orders, function(order){
                self.search_list.push(order.display_name, order.pos_reference)
            });
            this.render_list(orders);
        },
        reloading_orders: function(){
            var self = this;
            var OrderPromise = new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'pos.order',
                    method: 'ac_pos_search_read',
                    args: [{'domain': self.pos.domain_as_args}],
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function(orders){
                    if(orders.length > 0){
                        resolve(orders);
                    }
                }, function (type, err) { reject(); });
            })
            OrderPromise.then(function(orders){
                self.pos.db.add_orders(orders);
                self.pos.set({'pos_order_list' : orders});
                self.reload_orders();
            })
        },
        reloading_racks: function(){
            var self = this;
            var OrderPromise = new Promise(function (resolve, reject) {
                 var params = {
                    model: 'pos.order.rack',
                    method: 'search_read',
                    domain: [['config_id', '=', self.pos.config.id]],
                }
                return rpc.query(params, {async: false}).then(function(result){
                    if(result){
                        resolve(result);
                    }
                })
            })
            OrderPromise.then(function(racks){
                self.pos.db.add_rack(racks);
            })
        },
        renderElement: function(){
            var self = this;
            self._super();
            self.el.querySelector('.button.reload').addEventListener('click',this.reload_btn);
        },
    });
    gui.define_screen({name:'orderlist', widget: OrderListScreenWidget});

    screens.PaymentScreenWidget.include({
        show: function(){
            var self = this;
            this._super();
            this.renderElement();

            $(".promise_date").focus(function() {
                $('body').off('keypress', self.keyboard_handler);
                $('body').off('keydown', self.keyboard_keydown_handler);
                window.document.body.removeEventListener('keypress',self.keyboard_handler);
                window.document.body.removeEventListener('keydown',self.keyboard_keydown_handler);
            });

            $(".promise_date").focusout(function() {
                $('body').on('keypress', self.keyboard_handler);
                $('body').on('keydown', self.keyboard_keydown_handler);
            });
        },
        partial_payment: function() {
            var self = this;
            var currentOrder = this.pos.get_order();
            var client = currentOrder.get_client() || false;
            if(currentOrder.get_total_with_tax() > currentOrder.get_total_paid()
                    && currentOrder.get_total_paid() != 0){
                var credit = currentOrder.get_total_with_tax() - currentOrder.get_total_paid();
                if (client && client.remaining_credit_limit > credit && !currentOrder.get_paying_order()){
                    self.gui.show_popup('max_limit',{
                        remaining_credit_limit: client.remaining_credit_limit,
                        payment_obj: self,
                        partial_paid_order:true,
                    });
                }else if(client && client.remaining_credit_limit > credit && currentOrder.get_paying_order()){
                    self.pos.get_order().set_partial_paid_order(true);
                    self.finalize_validation();
                }else{
                    alert("Please verify the Credit Limit for the Selected Client.");
                }
            }
        },
        renderElement: function() {
            var self = this;
            this._super();
            this.$('#partial_pay').click(function(){
                self.partial_payment();
            });
            var order = self.pos.get_order();
            var amt_due = order.get_due();
            var tommorow = moment(moment(new Date()).add(1, 'days'))
            if(!order.get_order_promise_date()){
                tommorow = tommorow
            }else{
                tommorow = order.get_order_promise_date();
            }
            $('#promise_date').datetimepicker({
                inline:false,
//                minDate: 0,
                format:'d/m/Y H:i',
                formatDate:'d/m/Y',
                startDate: false,
                value: tommorow.format('DD/MM/YY HH:mm:ss'),
                todayHighlight: true,
                onChangeDateTime:function(){
                    var promise_date = moment($('.promise_date').datetimepicker('getValue'));
                    var format_date = moment(promise_date);
                    order.set_order_promise_date(format_date);
                },
            });

            this.$('.js_membership_card').click(function(){
                var order = self.pos.get_order();
                console.log("Client remain from this.db",self.pos.get_membership_remain());
                console.log("Client details",self.pos.get_partner_card_details(order.get_client()));
                console.log("*********************************");
                var client = order.get_client();
                var card = self.pos.db.membership_card_by_partner_id[client.id];
                console.log("Client remain from this.pos.db",card.card_value);

                var client = order.get_client();
                var due = order.get_due();
                if(client){
                    var card = self.pos.db.membership_card_by_partner_id[client.id];
                    var get_redeems = order.get_redeem_membership_card();
                    if(client && card){
                        var today = moment().format('YYYY-MM-DD');
                        if(card.expire_date >= today && card.issue_date <= today){
                            if(due > card.card_value){
                                if(!order.get_membership_card().length > 0 && !order.get_recharge_membership_card().length > 0 ){
                                    self.gui.show_popup('redeem_membership_card_popup', {'payment_self': self, 'card' : card});
                                }
                            }else{
                                var vals = {
                                    'redeem_card_no' : card.id,
                                    'redeem_card' : card.card_no,
                                    'redeem_card_amount' : order.get_due(),
                                    'redeem_remaining' : card.card_value - order.get_due(),
                                    'card_customer_id' : card.customer_id[0],
                                    'customer_name' : card.customer_id[1],
                                };

                                var cashregisters = null;
                                if(self.pos.config.enable_journal_id[0]){
                                    for ( var j = 0; j < self.pos.payment_methods.length; j++ ) {
                                        if ( self.pos.payment_methods[j].id === self.pos.config.enable_journal_id[0] ){
                                           cashregisters = self.pos.payment_methods[j];
                                        }
                                    }
                                }
                                if (vals){
                                    if (cashregisters){
                                        order.add_paymentline(cashregisters);
                                        order.selected_paymentline.set_amount(due,0 );
                                        order.selected_paymentline.set_membership_card_line_code(card.card_no);
                                        order.selected_paymentline.set_freeze(true);
                                        self.chrome.screens.payment.reset_input();
                                        self.chrome.screens.payment.render_paymentlines();
                                        order.set_redeem_membership_card(vals);
                                    }
                                }
                            }
                        }else{
                            alert(_t("Membership card has been expired."));
                        }
                    }else{

                    }
                }
            });

        },
        order_changes: function(){
            var self = this;
            this._super();
            var order = this.pos.get_order();
            var total = order ? order.get_total_with_tax() : 0;
            if(!order){
                return
            } else if(order.get_due() == 0 || order.get_due() == total || order.get_due() < 0){
                self.$('#partial_pay').removeClass('highlight');

            } else {
                self.$('#partial_pay').addClass('highlight');
            }
        },
        click_back: function(){
            var self = this;
            var order = this.pos.get_order();
            if(order.get_paying_order()){
                this.gui.show_popup('confirm',{
                    title: _t('Discard Sale Order'),
                    body:  _t('Do you want to discard the payment of POS '+ order.get_pos_reference() +' ?'),
                    confirm: function() {
                        order.finalize();
                    },
                });
            } else {
                self._super();
            }
        },
        click_invoice: function(){
            var self = this;
            var order = this.pos.get_order();
            if(!order.get_paying_order()){
                this._super();
            }
        },
        click_set_customer: function(){
            var self = this;
            var order = this.pos.get_order();
            if(!order.get_paying_order()){
                self._super();
            }
        },
        click_delete_paymentline: function(cid){
            var self = this;
            var lines = self.pos.get_order().get_paymentlines();
            var order = self.pos.get_order();
            var get_redeem = order.get_redeem_membership_card();
            for ( var i = 0; i < lines.length; i++ ) {
                if (lines[i].cid === cid) {
                    _.each(get_redeem, function(redeem){
                        if(lines[i].get_membership_card_line_code() == redeem.redeem_card ){
                            order.remove_card(lines[i].get_membership_card_line_code());
                        }
                    });
                    order.remove_paymentline(lines[i]);
                    self.reset_input();
                    self.render_paymentlines();
                    return
                }
            }
        },
        payment_input: function(input){
            var self = this;
            var order = this.pos.get_order();
            if(order.selected_paymentline && order.selected_paymentline.get_freeze()){
                return
            }
            this._super(input);
        },
        show_popup_payment_info: function(options) {
        var self = this;
        window.document.body.removeEventListener('keypress', self.keyboard_handler);
        window.document.body.removeEventListener('keydown', self.keyboard_keydown_handler);
        this.gui.show_popup('payment-info-input',{
            data: options.data,
            validate_info: function(infos){
                this.$('input').removeClass('error');
                if(!infos.bank_name) {
                    this.$('input[name=payment_ref]').addClass('error');
                    this.$('input[name=payment_ref]').focus();
                    return false;
                }
                return true;
            },
            confirm: function(infos){
                options.confirm.call(self, infos);
                self.reset_input();
                self.render_paymentlines();
//                window.document.body.addEventListener('keypress', self.keyboard_handler);
//                window.document.body.addEventListener('keydown', self.keyboard_keydown_handler);
            },
            cancel: function(){
//                window.document.body.addEventListener('keypress', self.keyboard_handler);
//                window.document.body.addEventListener('keydown', self.keyboard_keydown_handler);
            },
        });
    },
        click_paymentmethods: function(id) {
        var selectedOrder = this.pos.get_order();
        selectedOrder.initialize_validation_date();
        var client = selectedOrder.get_client();
        if(!client){
                return alert ('Please Select Customer !');
        }
        var self = this;

           //*************************
        var payment_method = this.pos.payment_methods_by_id[id];
        if (payment_method.pos_payment_ref == true) {
            this.show_popup_payment_info({
                confirm: function(infos) {
                    var self = this;
//                    console.log(self.pos.get_order());
                    //merge infos to new paymentline
                    self.pos.get_order().add_paymentline_with_details(payment_method, infos);
                },
            });
        }
        else {
              var payment_method = this.pos.payment_methods_by_id[id];
        self.pos.get_order().add_paymentline_with_notes(payment_method, {'note': self.pos.get_order().note});
        self.reset_input();
                self.render_paymentlines();


          //  this._super(id);
        }

    },
    validate_order: function(force_validation) {
         var self = this;
         var order = self.pos.get_order();
         var client = order.get_client();
         if(!client){
            return alert ('Please Select Customer !');
         }
        else{
            if (this.order_is_valid(force_validation)) {
                this.finalize_validation();
            }
        }
    },


    });
    screens.ActionpadWidget.include({
        renderElement: function() {
            var self = this;
            this._super();
            this.$('.payext').click(function(){
                var order = self.pos.get_order();
                var client = order.get_client();
                if(!client){
                    return alert ('Please Select Customer !');
                }
                else{
                    var order = self.pos.get_order();
                    var has_valid_product_lot = _.every(order.orderlines.models, function(line){
                        return line.has_valid_product_lot();
                    });
                    if(!has_valid_product_lot){
                        self.gui.show_popup('confirm',{
                            'title': _t('Empty Serial/Lot Number'),
                            'body':  _t('One or more product(s) required serial/lot number.'),
                            confirm: function(){
                                self.gui.show_screen('payment');
                            },
                        });
                    }else{
                        self.gui.show_screen('payment');
                    }
                }
            });
        }
    });
    screens.OrderWidget.include({
        set_value: function(val) {
            var order = this.pos.get_order();
            var line = order.get_selected_orderline();
            if (line && line.get_product().id != this.pos.config.prod_for_payment[0]) {
                this._super(val)
            }
        },
    });
    var OrderDetailScreenWidget = screens.ScreenWidget.extend({
        template: 'OrderDetailScreenWidget',
        show: function(){
            var self = this;
            self._super();
            var order = self.pos.get_order();
            var params = order.get_screen_data('params');
            var order_id = false;
            if(params){
                order_id = params.order_id;
            }
            if(order_id){
                self.clicked_order = self.pos.db.get_order_by_id(order_id)
                if(!self.clicked_order){
                    return new Promise(function (resolve, reject) {
                        rpc.query({
                            model: 'pos.order',
                            method: 'search_read',
                            domain: [['id', '=', order_id]],
                        }, {
                            timeout: 3000,
                            shadow: true,
                        })
                        .then(function(order){
                            if(order && order[0]){
                                self.clicked_order = order[0];
                                resolve();
                            } else {
                                reject();
                            }
                        }, function (type, err) { reject(); });
                    })
                }
            }
            this.renderElement();
            this.$('.back').click(function(){
                self.gui.back();
                if(params.previous){
                    self.pos.get_order().set_screen_data('previous-screen', params.previous);
                    if(params.partner_id){
                        $('.client-list-contents').find('.client-line[data-id="'+ params.partner_id +'"]').click();
                        $('#show_client_history').click();
                    }
                }
            });
            if(self.clicked_order){
                this.$('.pay').click(function(){
                    self.pos.gui.screen_instances.orderlist.pay_order_due(false, order_id)
                });
                var contents = this.$('.order-details-contents');
                contents.append($(QWeb.render('OrderDetails',{widget:this, order:self.clicked_order})));
                return new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'pos.payment',
                        method: 'search_read',
                        domain: [['pos_order_id', '=', order_id]],
                    }, {
                        timeout: 3000,
                        shadow: true,
                    })
                    .then(function(statements){
                        if(statements){
                            self.render_list(statements);
                            resolve();
                        } else {
                            reject();
                        }
                    }, function (type, err) { reject(); });
                });
            }
        },
        render_list: function(statements){
            if(statements){
                var contents = this.$el[0].querySelector('.paymentline-list-contents');
                contents.innerHTML = "";
                for(var i = 0, len = Math.min(statements.length,1000); i < len; i++){
                    var statement = statements[i];
                    var paymentline_html = QWeb.render('PaymentLines',{widget: this, statement:statement});
                    var paymentline = document.createElement('tbody');
                    paymentline.innerHTML = paymentline_html;
                    paymentline = paymentline.childNodes[1];
                    contents.append(paymentline);
                }
            }
        },
    });
    gui.define_screen({name:'orderdetail', widget: OrderDetailScreenWidget});

    screens.ClientListScreenWidget.include({
        events: {
            'click .button.back':  'click_back',
        },

        click_back: function(){
            this.gui.show_screen('products');
        },

        show: function(){
            var self = this;
            this._super();
            this.preferences_list = _.uniq([]);
            var $show_customers = $('#show_customers');
            var $show_client_history = $('#show_client_history');
            if (this.pos.get_order().get_client() || this.new_client) {
                $show_client_history.removeClass('oe_hidden');
            }
            $show_customers.off().on('click', function(e){
                $('.client-list').removeClass('oe_hidden');
                $('.customer_history').addClass('oe_hidden')
                $show_customers.addClass('oe_hidden');
                $show_client_history.removeClass('oe_hidden');
            })
            // self.customer_preference_by_id = {};
            _.each(self.partners, function(partner){
                self.partner_customer_preference[partner.id] = partner['customer_preference_ids']
            });

            var $show_customer_preferences = $('#customer_preferences');
            $show_customer_preferences.off().on('click', function(e){
                self.gui.show_screen('customer_preferences');
            })
        },
        toggle_save_button: function(){
            var self = this;
            this._super();
            var $show_customers = this.$('#show_customers');
            var $show_client_history = this.$('#show_client_history');
            var $customer_history = this.$('#customer_history');

            var client = this.new_client || this.pos.get_order().get_client();
            if (this.editing_client) {
                $show_customers.addClass('oe_hidden');
                $show_client_history.addClass('oe_hidden');
            } else {
                if(client){
                    $show_client_history.removeClass('oe_hidden');
                    $show_client_history.off().on('click', function(e){
                        self.render_client_history(client);
                        $('.client-list').addClass('oe_hidden');
                        $customer_history.removeClass('oe_hidden');
                        $show_client_history.addClass('oe_hidden');
                        $show_customers.removeClass('oe_hidden');
                    });
                } else {
                    $show_client_history.addClass('oe_hidden');
                    $show_client_history.off();
                }
            }
        },
        _get_customer_history: function(partner){
            var self = this;

            var domain = self.pos.domain_as_args.slice();
            domain.push(['partner_id', '=', partner.id]);

            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: domain,
                }, {
                    timeout: 3000,
                    shadow: true,
                })
                .then(function (orders) {
                    if (orders) {
                        var filtered_orders = orders.filter(function(o){return (o.amount_total - o.amount_paid) > 0});
                        partner['history'] = filtered_orders;
                        resolve();
                    } else {
                        reject();
                    }
                }, function (type, err) { reject(); });
            });
        },
        render_client_history: function(partner){
            var self = this;
            var contents = this.$el[0].querySelector('#client_history_contents');
            contents.innerHTML = "";
            self._get_customer_history(partner);
            if(partner.history){
                for (var i=0; i < partner.history.length; i++){
                    var history = partner.history[i];
                    var history_line_html = QWeb.render('ClientHistoryLine', {
                        partner: partner,
                        order: history,
                        widget: self,
                    });
                    var history_line = document.createElement('tbody');
                    history_line.innerHTML = history_line_html;
                    history_line = history_line.childNodes[1];
                    history_line.addEventListener('click', function(e){
                        var order_id = $(this).data('id');
                        if(order_id){
                            var previous = self.pos.get_order().get_screen_data('previous-screen');
                            self.gui.show_screen('orderdetail', {
                                order_id: order_id,
                                previous: previous,
                                partner_id: partner.id
                            });
                        }
                    })
                    contents.appendChild(history_line);
                }
            }
        },
        render_payment_history: function(){
            var self = this;
            var $client_details_box = $('.client-details-box');
            $client_details_box.addClass('oe_hidden');
        },
        display_client_details: function(visibility,partner,clickpos){
            var self = this;
            var searchbox = this.$('.searchbox input');
            var contents = this.$('.client-details-contents');
            var parent   = this.$('.client-list').parent();
            var scroll   = parent.scrollTop();
            var height   = contents.height();

            contents.off('click','.button.edit');
            contents.off('click','.button.save');
            contents.off('click','.button.undo');
            contents.on('click','.button.edit',function(){ self.edit_client_details(partner); });
            contents.on('click','.button.save',function(){ self.save_client_details(partner); });
            contents.on('click','.button.undo',function(){ self.undo_client_details(partner); });
            this.editing_client = false;
            this.uploaded_picture = null;

            if(visibility === 'show'){
                contents.empty();
                if(self.preferences_list && self.preferences_list.length > 0){
                    partner['customer_preference_ids'] = _.uniq(self.preferences_list);
                }
                contents.append($(QWeb.render('ClientDetails',{widget:this,partner:partner})));

                var new_height   = contents.height();

                if(!this.details_visible){
                    // resize client list to take into account client details
                    parent.height('-=' + new_height);

                    if(clickpos < scroll + new_height + 20 ){
                        parent.scrollTop( clickpos - 20 );
                    }else{
                        parent.scrollTop(parent.scrollTop() + new_height);
                    }
                }else{
                    parent.scrollTop(parent.scrollTop() - height + new_height);
                }

                this.details_visible = true;
                this.toggle_save_button();
            } else if (visibility === 'edit') {
                // Connect the keyboard to the edited field
                if (this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard) {
                    contents.off('click', '.detail');
                    searchbox.off('click');
                    contents.on('click', '.detail', function(ev){
                        self.chrome.widget.keyboard.connect(ev.target);
                        self.chrome.widget.keyboard.show();
                    });
                    searchbox.on('click', function() {
                        self.chrome.widget.keyboard.connect($(this));
                    });
                }

                this.editing_client = true;
                contents.empty();
                var client_detail = $(QWeb.render('ClientDetailsEdit',{widget:this,partner:partner}));
                contents.append(client_detail);
                var product_html;
                if(partner.customer_preference_ids){
                    product_html = QWeb.render('customer_preference_tmpl', {
                        product: self.pos.customer_preference,
                        widget: self,
                        preference_id: partner.customer_preference_ids,
                    });
                }else{
                    product_html = QWeb.render('customer_preference_tmpl', {
                        product: self.pos.customer_preference,
                        widget: self,
                        preference_id: [],
                    });
                }
//                client_detail.find("#customer_preference").empty();
                client_detail.find("#customer_preference").empty().append(product_html);
                self.toggle_save_button();
                contents.find('input').blur(function() {
                    setTimeout(function() {
                        self.$('.window').scrollTop(0);
                    }, 0);
                });

                contents.find('.image-uploader').on('change',function(event){
                    self.load_image_file(event.target.files[0],function(res){
                        if (res) {
                            contents.find('.client-picture img, .client-picture .fa').remove();
                            contents.find('.client-picture').append("<img src='"+res+"'>");
                            contents.find('.detail.picture').remove();
                            self.uploaded_picture = res;
                        }
                    });
                });
                contents.find('.client-address-governator').on('change', function (ev) {
                var $citySelection = contents.find('.client-address-city');
                var value = this.value;
                $citySelection.empty()
                $citySelection.append($("<option/>", {
                    value: '',
                    text: 'None',
                }));
                self.pos.cities.forEach(function (city) {
                    if (city.governorate_id[0] == value) {
                        $citySelection.append($("<option/>", {
                            value: city.id,
                            text: city.name
                            }));
                        }
                    });
                    var $blockSelection = contents.find('.client-address-block');
                    $blockSelection.empty()
                    $blockSelection.append($("<option/>", {
                        value: '',
                        text: 'None',
                    }));
                });
                contents.find('.client-address-city').on('change', function (ev) {
                var $blockSelection = contents.find('.client-address-block');
                var value = this.value;
                $blockSelection.empty()
                $blockSelection.append($("<option/>", {
                    value: '',
                    text: 'None',
                }));
                self.pos.blocks.forEach(function (block) {
                    if (block.city_id[0] == value) {
                        $blockSelection.append($("<option/>", {
                            value: block.id,
                            text: block.name
                            }));
                        }
                    });
                });
                contents.find('.client-phone').on('change', function (ev) {
                var value = this.value;
                var clientname = document.getElementById("client-name").value;
                if (value != '' && clientname != ''){
                document.getElementById("button-save").style.color = 'green';
                }
                else{
                    document.getElementById("button-save").style.color = 'gray';
                    }
                });
                contents.find('.client-name').on('change', function (ev) {
                var value = this.value;
                var clientphone = document.getElementById("client-phone").value;
                if (value != '' && clientphone != ''){
                document.getElementById("button-save").style.color = 'green';
                }
                else{
                    document.getElementById("button-save").style.color = 'gray';
                    }
                });
            } else if (visibility === 'hide') {
                contents.empty();
                parent.height('100%');
                if( height > scroll ){
                    contents.css({height:height+'px'});
                    contents.animate({height:0},400,function(){
                        contents.css({height:''});
                    });
                }else{
                    parent.scrollTop( parent.scrollTop() - height);
                }
                this.details_visible = false;
                this.toggle_save_button();
            }

            $(".chosen-select").chosen({disable_search_threshold: 10}).change(function(event){
                var data = $(this).val()
                if(data && data.length > 0){
                    self.preferences_list = []
                    _.each(data, function(each){
                        self.preferences_list.push(Number(each));
                    });
                }else{
                    self.preferences_list = [];
                }
                self.preferences_list = _.uniq(self.preferences_list);
            })
        },
        save_client_details: function(partner) {
            var self = this;
            var fields = {};
            this.$('.client-details-contents .detail').each(function(idx,el){
                if (self.integer_client_details.includes(el.name)){
                    var parsed_value = parseInt(el.value, 10);
                    if (isNaN(parsed_value)){
                        fields[el.name] = false;
                    }
                    else{
                        fields[el.name] = parsed_value
                    }
                }
                else{
                    fields[el.name] = el.value || false;
                }
            });

            if (!fields.name) {
                this.gui.show_popup('error',_t('A Customer Name Is Required'));
                return;
            }
            if (!fields.phone) {
                alert(_t('A Customer Phone Is Required'));
                return;
            }

            if (this.uploaded_picture) {
                fields.image_1920 = this.uploaded_picture;
            }

            fields.id = partner.id || false;

            var contents = this.$(".client-details-contents");
            contents.off("click", ".button.save");
            fields['customer_preference_ids'] = [[6,0,self.preferences_list ? self.preferences_list : []]];
            if(!fields.credit_limit){
                fields['credit_limit'] = self.pos.config.default_customer_credit_limit;
            }
            rpc.query({
                model: 'res.partner',
                method: 'create_from_ui',
                args: [fields],
            })
            .then(function(partner_id){
                self.saved_client_details(partner_id);
            }).catch(function(error){
                error.event.preventDefault();
                var error_body = _t('Your Internet connection is probably down.');
                if (error.message.data) {
                    var except = error.message.data;
                    error_body = except.arguments && except.arguments[0] || except.message || error_body;
                }
                self.gui.show_popup('error',{
                    'title': _t('Error: Could not Save Changes'),
                    'body': error_body,
                });
                contents.on('click','.button.save',function(){ self.save_client_details(partner); });
            });
        },
    });

    screens.ProductListWidget.include({
        init: function(parent, options) {
        var self = this;
        this._super(parent,options);
        this.click_product_handler = function(){
            var order = self.pos.get_order();
            var client = order.get_client();
            if(!client){
                return alert ('Please Select Customer !');
            }
            else{
                var product = self.pos.db.get_product_by_id(this.dataset.productId);
                options.click_product_action(product);
            }
        };
        },
        set_product_list: function(product_list){
            var self = this;
            var new_product_list = [];
            var membership_card_id = self.pos.config.membership_card_product_id[0] || false;
            if(product_list.length > 0){
                product_list.map(function(pro_list){
                    if(pro_list.id != membership_card_id){
                        new_product_list.push(pro_list);
                    }
                });
            }
            this.product_list = new_product_list;
            this.renderElement();
        },
    });

    screens.ReceiptScreenWidget.include({
        show: function(){
            var self = this;
            this._super();
            var order = this.pos.get_order();
            var barcode_val = order.get_membership_card();
            if( barcode_val && barcode_val[0]){
                var barcode = barcode_val[0].membership_card_card_no;
            }
            var barcode_recharge_val = order.get_recharge_membership_card();
            if( barcode_recharge_val && barcode_recharge_val[0]){
                var barcode = barcode_recharge_val[0].recharge_card_no;
            }
            var barcode_free_val = order.get_free_data();
            if( barcode_free_val){
                var barcode = barcode_free_val.membership_card_card_no;
            }
            var barcode_redeem_val = order.get_redeem_membership_card();
            if( barcode_redeem_val && barcode_redeem_val[0]){
                var barcode = barcode_redeem_val[0].redeem_card;
            }
            if(barcode){
                $("#test-barcode").JsBarcode(barcode.toString());
            }
            var order_barcode = this.pos.get_order().name
            if(order_barcode){
                order_barcode = order_barcode.split(" ")[1]
                $("#order-barcode").JsBarcode(order_barcode.toString());
            }
        },
        print_html: function () {
            var receipt = QWeb.render('CustomXmlReceipt', this.get_receipt_render_env());
            this.pos.proxy.printer.print_receipt(receipt);
            this.pos.get_order()._printed = true;
        },
        get_receipt_render_env: function() {
            var order_backend = false;
            var order = this.pos.get_order();
            // *********************************************
//            rpc.query({
//                        model: 'pos.order',
//                        method: 'search_read',
//                        domain: [['pos_reference', '=', order.name]],
//                    }, {
//                        timeout: 300,
//                        shadow: true,
//                    })
//                    .then(function(order){
//                        if(order && order[0]){
//                            result = order[0];
//                            return result;
//                        } else {
//                        return false;
//                    }
//                });
//            console.log(result);
            //**********************************************
            var barcode_val = order.get_membership_card();
            var barcode_recharge_val = order.get_recharge_membership_card();
            var barcode_free_val = order.get_free_data();
            var barcode_redeem_val = order.get_redeem_membership_card();
            if( barcode_recharge_val && barcode_recharge_val[0]){
                var barcode = barcode_recharge_val[0].recharge_card_no;
            }else if( barcode_val && barcode_val[0]){
                var barcode = barcode_val[0].membership_card_card_no;
            }else if(barcode_free_val){
                var barcode = barcode_free_val.membership_card_no;
            }else if(barcode_redeem_val && barcode_redeem_val[0]){
                var barcode = barcode_redeem_val[0].redeem_card;
            }
            if(barcode){
                var img = new Image();
                img.id = "test-barcode";
                $(img).JsBarcode(barcode.toString());
            }
            return {
                widget: this,
                pos: this.pos,
                order: order,
                result:false,
                receipt: order.export_for_printing(),
                orderlines: order.get_orderlines(),
                paymentlines: order.get_paymentlines(),
                get_barcode_image: $(img)[0] ? $(img)[0].src : false,
            };
        },
        get_customer_adjustment_env:function(){
            var order = this.pos.get_order();
            return {
                widget: this,
                pos: this.pos,
                order: order,
                receipt: order.export_for_printing(),
                data: order.get_customer_adjustment()[0] || [],
                reason: this.pos.adjustment_reason_by_id[order.get_customer_adjustment()[0].adjustment_reason]
            };
        },
        get_customer_previous_env:function(){
            var order = this.pos.get_order();
            return {
                widget: this,
                pos: this.pos,
                order: order,
                receipt: order.export_for_printing(),
                data: order.previous[0] || [],
            };
        },
        get_label_env : function(){
            var order = this.pos.get_order();
            var order_lines = order.get_orderlines();
            var tot_product = order_lines ? order_lines : 0;
            var customer = order.get_client();
            var preferences = customer.customer_preference_ids ? customer.customer_preference_ids : [];
            var customer_vals = {'name':customer ? customer.name : '',
                                 'phone': customer ? customer.phone : '',
                                 'preference':preferences
                                 }
            var count = 0;
            var receipt_html = [];
            var total = 0;
            for (var k=0 ; k < order_lines.length;k++){
            var c = order_lines[k].product.label_count;
            var le = order_lines[k].quantity;
            total+=(c*le);
            }

            for (var i=0; i< order_lines.length;i++){
                var line = order_lines[i];
                for (var j=0 ;j<line.product.label_count*line.quantity;j++){
                count += 1;
                console.log(line.product.display_name);
                vals ={
                      widget: this,
                     'product' : line.product.display_name,
                     'service' : line.product.pos_categ_id ? line.product.pos_categ_id[1]: false,
                     'client'  : customer_vals ? customer_vals : {},
                     'total'   : total || 0,
                     'count'   : count,
                     'promise_date' : moment(order.promise_date).format("ddd M-D-YY"),
                     'quantity': line.quantity*line.product.label_count,
                     'order'   : order.name
                }
                receipt_html.push(QWeb.render('TokenTicket', vals));
                }

            }
            console.log(receipt_html);
            return receipt_html

        },
        render_receipt: function() {
            var order = this.pos.get_order();
            if(order.is_adjustment){
                var receipt_html = QWeb.render('CustomerAdjustment',this.get_customer_adjustment_env());
                this.$('.pos-receipt-container').html(receipt_html);
            }else if (order.get_free_data()){
                var receipt_html = QWeb.render('FreeTicket',this.get_receipt_render_env());
                this.$('.pos-receipt-container').html(receipt_html);
            }else if (order.is_previous_order){

                var receipt_html = QWeb.render('CustomerPrevious',this.get_customer_previous_env());
                this.$('.pos-receipt-container').html(receipt_html);
            }else{
                var receipt_html = QWeb.render('OrderReceipt',this.get_receipt_render_env());
                this.$('.pos-receipt-container').html(receipt_html);
            }
//            var label_html = QWeb.render('TokenTicket', this.get_label_env());
//            this.$('.pos-label-container').html(label_html);
//            console.log(this.get_label_env());

        },
        // Receipt Printer
        print: function() {
             if ($.browser.safari) {
                document.execCommand('print', false, null);
            } else {
                try {
                    window.print();
                } catch(err) {
                    if (navigator.userAgent.toLowerCase().indexOf("android") > -1) {
                        this.gui.show_popup('error',{
                            'title':_t('Printing is not supported on some android browsers'),
                            'body': _t('Printing is not supported on some android browsers due to no default printing protocol is available. It is possible to print your tickets by making use of an IoT Box.'),
                        });
                    } else {
                        throw err;
                    }
                }
            }
            this.pos.get_order()._printed = true;
        },
        print_token_receipt: function () {
            var self = this;
            var receipt_html = this.get_label_env();
            if(self.pos.proxy.printer){
                var i = -1
                function ReceiptLoop(ticket) {
                  setTimeout(function() {
                    if(ticket){
                        self.pos.proxy.printer.print_receipt(ticket);
                    }
                    i+=1;
                    if (i < receipt_html.length) {
                        ReceiptLoop(receipt_html[i]);
                    }
                  }, 1000)
                }
                ReceiptLoop();
            }
        },
        renderElement: function () {
            var self = this;
            this._super();
            this.$('.token_print').click(function () {
                self.print_token_receipt();
            });
        },
    });

});